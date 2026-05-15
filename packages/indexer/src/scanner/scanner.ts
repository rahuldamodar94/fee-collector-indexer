import { ethers } from "ethers";
import {
  ChainConfig,
  IndexerStateModel,
  FeeCollectedEventModel,
  getLogger,
} from "@fee-collector/shared";
import { createProvider } from "./rpc-client";
import {
  FEE_COLLECTED_TOPIC,
  ParsedFeeCollectedEvent,
  parseLog,
} from "./parser";
import {
  ChunkTooLargeError,
  RetryGiveupError,
  isChunkTooLarge,
  withRetry,
} from "./retry";
import { nextChunkSize, ChunkState } from "./chunk-sizer";

let stopRequested = false;

export function requestScannerStop(): void {
  stopRequested = true;
}

export async function startScanner(config: ChainConfig) {
  const logger = getLogger();
  const provider = createProvider(config.rpcUrls, config.chainId);

  let state = await IndexerStateModel.findOne({ chainId: config.chainId });

  if (!state) {
    state = await IndexerStateModel.create({
      chainId: config.chainId,
      lastProcessedBlockNumber: config.startBlock - 1,
      status: "running",
    });
  }

  let chunkState: ChunkState = {
    currentSize: config.initialChunkSize,
    consecutiveSuccess: 0,
  };

  while (!stopRequested) {
    if (state.status === "halted") {
      logger.error("scanner halted, exiting");
      return;
    }

    try {
      const safeHead = await getSafeHead(provider, config);
      const fromBlock = state.lastProcessedBlockNumber + 1;

      if (fromBlock > safeHead) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      if (state.lastProcessedBlockHash) {
        const firstBlock = await provider.getBlock(fromBlock);
        if (
          firstBlock.parentHash.toLowerCase() !==
          state.lastProcessedBlockHash.toLowerCase()
        ) {
          logger.error("reorg detected", {
            storedHash: state.lastProcessedBlockHash,
            parentHash: firstBlock.parentHash,
            blockNumber: fromBlock,
          });
          state.status = "halted";
          state.lastError = `reorg detected: stored=${state.lastProcessedBlockHash} parent=${firstBlock.parentHash}`;
          state.lastErrorAt = new Date();
          await state.save();
          return;
        }
      }

      const toBlock = Math.min(
        safeHead,
        fromBlock + chunkState.currentSize - 1,
      );

      const blocksBehind = safeHead - state.lastProcessedBlockNumber;

      logger.info("fetching chunk", {
        fromBlock,
        toBlock,
        chunkSize: chunkState.currentSize,
        blocksBehind,
      });

      let logs: ethers.providers.Log[];

      try {
        logs = await withRetry(async () => {
          try {
            return await provider.getLogs({
              address: config.contractAddress,
              fromBlock,
              toBlock,
              topics: [FEE_COLLECTED_TOPIC],
            });
          } catch (err) {
            if (isChunkTooLarge(err)) {
              throw new ChunkTooLargeError("chunk too large");
            }
            throw err;
          }
        }, config.maxRetries);
      } catch (err) {
        if (err instanceof ChunkTooLargeError) {
          chunkState = nextChunkSize(
            "too-large",
            chunkState,
            config,
            blocksBehind,
          );
          continue;
        }
        throw err;
      }

      const parsed: ParsedFeeCollectedEvent[] = [];

      for (const log of logs) {
        const block = await provider.getBlock(log.blockNumber);
        parsed.push(
          parseLog(log, config.chainId, new Date(block.timestamp * 1000)),
        );
      }

      if (parsed.length > 0) {
        try {
          logger.info("inserting events", { count: parsed.length });
          await FeeCollectedEventModel.insertMany(parsed, { ordered: false });
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) {
            logger.error("insert failed", { err });
            throw err;
          }
        }
      }

      const lastBlock = await provider.getBlock(toBlock);

      state.lastProcessedBlockNumber = lastBlock.number;
      state.lastProcessedBlockHash = lastBlock.hash;
      await state.save();

      chunkState = nextChunkSize("success", chunkState, config, blocksBehind);

      logger.info("chunk processed", { lastBlock: lastBlock.number });
    } catch (error) {
      const cooldown =
        error instanceof RetryGiveupError ? 30000 : config.pollIntervalMs;
      logger.error("scanner cycle error", { err: error, cooldownMs: cooldown });
      await sleep(cooldown);
    }
  }

  logger.info("scanner stopped");
}

async function getSafeHead(
  provider: ethers.providers.BaseProvider,
  config: ChainConfig,
): Promise<number> {
  if (config.finalityStrategy === "finalized") {
    const block = await provider.getBlock("finalized");
    return block.number;
  }

  const latest = await provider.getBlockNumber();
  return latest - config.confirmationDepth;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
