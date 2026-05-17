import { ethers } from "ethers";
import {
  ChainConfig,
  IndexerStateModel,
  FeeCollectedEventModel,
  getLogger,
} from "@fee-collector/shared";
import { createProvider, createBatchProvider } from "./rpc-client";
import {
  FEE_COLLECTED_TOPIC,
  ParsedFeeCollectedEvent,
  parseLog,
} from "./parser";
import { RetryGiveupError, withRetry } from "./retry";
import { nextChunkSize, ChunkState, isChunkTooLarge } from "./chunk-sizer";
import {
  eventsIngestedTotal,
  chainHeadLagBlocks,
  rpcErrorsTotal,
  reorgDetectedTotal,
} from "../metrics";

const LONG_PAUSE_MS = 30_000;

let stopRequested = false;

export function requestScannerStop(): void {
  stopRequested = true;
}

/** Test-only. Resets the module-level stop flag so each test starts fresh. */
export function __resetStopRequestedForTests(): void {
  stopRequested = false;
}

export async function startScanner(config: ChainConfig) {
  const logger = getLogger();
  const provider = createProvider(config.rpcUrls, config.chainId);
  const batchProvider = createBatchProvider(config.rpcUrls, config.chainId);

  let state = await IndexerStateModel.findOne({ chainId: config.chainId });

  if (!state) {
    state = await IndexerStateModel.create({
      chainId: config.chainId,
      lastProcessedBlockNumber: config.startBlock - 1,
      status: "running",
    });
  }

  if (state.status === "halted") {
    logger.error("scanner halted on boot, exiting");
    return;
  }

  let chunkState: ChunkState = {
    currentSize: config.initialChunkSize,
    consecutiveSuccess: 0,
  };

  while (!stopRequested) {
    try {
      const safeHead = await getSafeHead(provider, config);
      const fromBlock = state.lastProcessedBlockNumber + 1;

      if (fromBlock > safeHead) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      if (state.lastProcessedBlockHash) {
        const firstBlock = await withRetry(
          () => provider.getBlock(fromBlock),
          config.maxRetries,
        );
        if (!firstBlock?.parentHash) {
          logger.warn("getBlock returned no parentHash, retrying next cycle", {
            fromBlock,
          });
          await sleep(config.pollIntervalMs);
          continue;
        }
        if (
          firstBlock.parentHash.toLowerCase() !==
          state.lastProcessedBlockHash.toLowerCase()
        ) {
          logger.error("reorg detected", {
            storedHash: state.lastProcessedBlockHash,
            parentHash: firstBlock.parentHash,
            blockNumber: fromBlock,
          });
          reorgDetectedTotal.inc({ chain: config.chainName });
          state.status = "halted";
          state.lastError = `reorg detected: stored=${state.lastProcessedBlockHash.toLowerCase()} parent=${firstBlock.parentHash.toLowerCase()}`;
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
      chainHeadLagBlocks.set({ chain: config.chainName }, blocksBehind);

      logger.info("fetching chunk", {
        fromBlock,
        toBlock,
        chunkSize: chunkState.currentSize,
        blocksBehind,
      });

      let parsed: ParsedFeeCollectedEvent[];
      try {
        parsed = await fetchAndParseChunk(
          provider,
          batchProvider,
          config,
          fromBlock,
          toBlock,
        );
      } catch (err) {
        if (isChunkTooLarge(err)) {
          chunkState = nextChunkSize(
            "too-large",
            chunkState,
            config,
            blocksBehind,
          );
          rpcErrorsTotal.inc({
            chain: config.chainName,
            type: "chunk_too_large",
          });
          continue;
        }
        throw err;
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
        // Overcounts on retried cycles where some rows hit 11000; accepted
        // because duplicates only occur on crash-mid-cycle restarts.
        eventsIngestedTotal.inc({ chain: config.chainName }, parsed.length);
      }

      const lastBlock = await withRetry(
        () => provider.getBlock(toBlock),
        config.maxRetries,
      );

      state.lastProcessedBlockNumber = lastBlock.number;
      state.lastProcessedBlockHash = lastBlock.hash;
      await state.save();

      chunkState = nextChunkSize("success", chunkState, config, blocksBehind);

      logger.info("chunk processed", { lastBlock: lastBlock.number });
    } catch (error) {
      const cooldown =
        error instanceof RetryGiveupError ? LONG_PAUSE_MS : config.pollIntervalMs;
      rpcErrorsTotal.inc({
        chain: config.chainName,
        type: error instanceof RetryGiveupError ? "retry_exhausted" : "unknown",
      });
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
    const block = await withRetry(
      () => provider.getBlock("finalized"),
      config.maxRetries,
    );
    return block.number;
  }

  const latest = await withRetry(
    () => provider.getBlockNumber(),
    config.maxRetries,
  );
  return latest - config.confirmationDepth;
}

async function fetchAndParseChunk(
  provider: ethers.providers.BaseProvider,
  batchProvider: ethers.providers.BaseProvider,
  config: ChainConfig,
  fromBlock: number,
  toBlock: number,
): Promise<ParsedFeeCollectedEvent[]> {
  const logs = await withRetry(
    () =>
      provider.getLogs({
        address: config.contractAddress,
        fromBlock,
        toBlock,
        topics: [FEE_COLLECTED_TOPIC],
      }),
    config.maxRetries,
  );

  // Tenderly caps JSON-RPC batches at 100; 50 leaves 2x headroom.
  const BATCH_SIZE = 50;
  const parsed: ParsedFeeCollectedEvent[] = [];

  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const slice = logs.slice(i, i + BATCH_SIZE);
    const parsedSlice = await Promise.all(
      slice.map(async (log) => {
        const block = await withRetry(
          () => batchProvider.getBlock(log.blockNumber),
          config.maxRetries,
        );
        return parseLog(log, config.chainId, new Date(block.timestamp * 1000));
      }),
    );
    parsed.push(...parsedSlice);
  }

  return parsed;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
