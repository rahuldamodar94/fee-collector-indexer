import type { ChainConfig } from "@fee-collector/shared";

export interface ChunkState {
  currentSize: number;
  consecutiveSuccess: number;
}

export type ChunkOutcome = "success" | "too-large";

const GROWTH_THRESHOLD = 10;
const GROWTH_MULTIPLIER = 1.5;
const NEAR_HEAD_BLOCKS = 100;

export function nextChunkSize(
  outcome: ChunkOutcome,
  state: ChunkState,
  config: ChainConfig,
  blocksBehind: number,
): ChunkState {
  if (blocksBehind < NEAR_HEAD_BLOCKS) {
    return {
      currentSize: config.minChunkSize,
      consecutiveSuccess: 0,
    };
  }

  if (outcome === "too-large") {
    return {
      currentSize: Math.max(
        config.minChunkSize,
        Math.floor(state.currentSize / 2),
      ),
      consecutiveSuccess: 0,
    };
  }

  const newSuccess = state.consecutiveSuccess + 1;

  if (newSuccess >= GROWTH_THRESHOLD) {
    return {
      currentSize: Math.min(
        config.maxChunkSize,
        Math.floor(state.currentSize * GROWTH_MULTIPLIER),
      ),
      consecutiveSuccess: 0,
    };
  }

  return {
    currentSize: state.currentSize,
    consecutiveSuccess: newSuccess,
  };
}
