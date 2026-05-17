import { Counter, Gauge, collectDefaultMetrics } from "prom-client";

collectDefaultMetrics();

export const eventsIngestedTotal = new Counter({
  name: "fee_collector_events_ingested_total",
  help: "Total FeesCollected events written to the database",
  labelNames: ["chain"] as const,
});

export const chainHeadLagBlocks = new Gauge({
  name: "fee_collector_chain_head_lag_blocks",
  help: "Number of blocks behind the chain head",
  labelNames: ["chain"] as const,
});

export type RpcErrorType = "chunk_too_large" | "retry_exhausted" | "unknown";

export const rpcErrorsTotal = new Counter({
  name: "fee_collector_rpc_errors_total",
  help: "Total RPC errors encountered, classified by type",
  labelNames: ["chain", "type"] as const,
});

export const reorgDetectedTotal = new Counter({
  name: "fee_collector_reorg_detected_total",
  help: "Total reorgs detected by parent-hash check",
  labelNames: ["chain"] as const,
});
