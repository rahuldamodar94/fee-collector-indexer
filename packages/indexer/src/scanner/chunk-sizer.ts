import type { ChainConfig } from "@fee-collector/shared";

export interface ChunkState {
  currentSize: number;
  consecutiveSuccess: number;
}

const tooLargePhrases = [
  "too many results",
  "log response size exceeded",
  "query returned more than",
  "exceeded max results",
  "request entity too large",
];

export function isChunkTooLarge(err: unknown): boolean {
  const e = err as { message?: string; status?: number; code?: string };
  const message = (e?.message ?? "").toLowerCase();
  const matchesPhrase = tooLargePhrases.some((p) => message.includes(p));
  const isTimeout = e?.status === 504 || e?.code === "TIMEOUT";
  return matchesPhrase || isTimeout;
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
