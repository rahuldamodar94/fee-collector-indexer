import { ethers } from "ethers";
import {
  ChainConfig,
  IndexerStateModel,
  FeeCollectedEventModel,
} from "@fee-collector/shared";
import { createProvider } from "./rpc-client";
import {
  FEE_COLLECTED_TOPIC,
  ParsedFeeCollectedEvent,
  parseLog,
} from "./parser";
import { ChunkTooLargeError, withRetry } from "./retry";
import { nextChunkSize, ChunkState } from "./chunk-sizer";

export async function startScanner(config: ChainConfig) {
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

  while (true) {
    if (state.status === "halted") {
      console.error(`chain ${config.chainId} halted, exiting scanner`);
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
          console.error(
            `reorg detected on chain ${config.chainId}: stored=${state.lastProcessedBlockHash} parent=${firstBlock.parentHash}`,
          );
          state.status = "halted";
          await state.save();
          return;
        }
      }

      const toBlock = Math.min(
        safeHead,
        fromBlock + chunkState.currentSize - 1,
      );

      const blocksBehind = safeHead - state.lastProcessedBlockNumber;

      console.log(
        `fetching ${fromBlock} → ${toBlock} (chunk=${chunkState.currentSize}, behind=${blocksBehind})`,
      );

      let logs: ethers.providers.Log[];

      try {
        logs = await withRetry(
          () =>
            provider.getLogs({
              address: config.contractAddress,
              fromBlock,
              toBlock,
              topics: [FEE_COLLECTED_TOPIC],
            }),
          config.maxRetries,
        );
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
          console.log(`Inserting ${parsed.length} events into database...`);
          await FeeCollectedEventModel.insertMany(parsed, { ordered: false });
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) {
            console.error("Error inserting events", err);
            throw err;
          }
        }
      }

      const lastBlock = await provider.getBlock(toBlock);

      state.lastProcessedBlockNumber = lastBlock.number;
      state.lastProcessedBlockHash = lastBlock.hash;
      await state.save();

      chunkState = nextChunkSize("success", chunkState, config, blocksBehind);

      console.log(
        `Finished processing up to block ${lastBlock.number} on ${config.chainName}`,
      );
    } catch (error) {
      console.error("scanner error", error);
      await sleep(config.pollIntervalMs);
    }
  }
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
