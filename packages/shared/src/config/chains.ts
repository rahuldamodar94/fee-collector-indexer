import type { Env } from "./env";

export type FinalityStrategy = "finalized" | "confirmations";

export interface ChainConfig {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  contractAddress: string;
  startBlock: number;
  finalityStrategy: FinalityStrategy;
  confirmationDepth: number;
  pollIntervalMs: number;
  initialChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
  maxRetries: number;
}

export function buildChainConfig(env: Env): ChainConfig {
  return {
    chainId: env.CHAIN_ID,
    chainName: env.CHAIN_NAME,
    rpcUrls: env.RPC_URLS.split(","),
    contractAddress: env.CONTRACT_ADDRESS.toLowerCase(),
    startBlock: env.START_BLOCK,
    finalityStrategy: env.FINALITY_STRATEGY,
    confirmationDepth: env.CONFIRMATION_DEPTH,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    initialChunkSize: env.INITIAL_CHUNK_SIZE,
    minChunkSize: env.MIN_CHUNK_SIZE,
    maxChunkSize: env.MAX_CHUNK_SIZE,
    maxRetries: env.MAX_RETRIES,
  };
}
