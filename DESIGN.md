# DESIGN.md

Why the codebase is shaped this way. The [README](./README.md) covers what the code does and how to run it; this is the why.

## Five decisions

**Finality-anchored indexing with panic halt on reorg.** Safe head is `finalized` where available, otherwise `latest - CONFIRMATION_DEPTH`. The scanner never reads past it. Integrators consume this data for fee accounting, not a live UI, so a few minutes of lag is fine and wrong numbers are not. Correctness over freshness, on purpose. Rolling back on reorg would be a whole code path for something the finalized tag already prevents, so it stays out. As a backstop, every chunk's first block is checked against the stored parent hash; on mismatch the scanner halts the chain and exits.

**Idempotent inserts via a unique compound index, not Mongo transactions.** Each event row is uniquely identified by `(chainId, transactionHash, logIndex)`. The scanner uses `insertMany({ ordered: false })`, and on `BulkWriteError` treats duplicate-key entries as already-persisted. Together that gives us exactly-once effect without a replica set. Transactions would have cost performance and infra for no correctness gain.

**Separate `indexer_states` collection rather than deriving the cursor from `MAX(blockNumber)`.** Derived state cannot store the parent hash needed for the reorg check, and cannot distinguish "scanned and found zero events" from "never scanned." A single doc per chain costs nothing and fixes both. It's also the natural place for `status`, `lastError`, and `lastErrorAt` when the scanner halts.

**Cursor pagination on `(blockNumber, logIndex)`, not `skip` / `limit`.** Offset pagination is O(N) on the skipped prefix and unstable when new events arrive mid-paginate. The cursor is base64url-encoded JSON, validated server-side; clients treat it as opaque. The compound index on `(integrator, blockNumber desc, logIndex desc)` serves every page from the index.

The cursor deliberately does not include `chainId`. `chainId` is a required query parameter instead — cleaner than packing it into the cursor and adding a tiebreaker to the sort. Multi-chain queries fan out client-side, one per chain.

**Adaptive chunk sizing for `eth_getLogs`.** RPC providers cap response sizes differently and their error messages vary: "too many results", "log response size exceeded", "query returned more than 10000 results", plus HTTP 504 and ethers `TIMEOUT` when the response is just too big to deliver in time. The scanner treats all of these as "shrink the chunk", halves the size, and retries immediately without consuming the retry budget. After ten consecutive successes the chunk grows by 1.5x, capped at `MAX_CHUNK_SIZE`. Near the head it pins to `MIN_CHUNK_SIZE` for latency. Fixed sizing doesn't work — backfill wants big chunks for throughput, head-following wants small chunks for latency.

## Retry semantics

`withRetry` classifies errors before retrying. Transient signals (HTTP 429/502/503, ethers `SERVER_ERROR`/`NETWORK_ERROR`/`ETIMEDOUT`, `ECONNRESET`/`ECONNREFUSED`) trigger exponential backoff with jitter, capped at 30 seconds, up to `MAX_RETRIES` attempts. Everything else throws immediately. After the retry budget runs out, `withRetry` throws `RetryGiveupError`; the scanner catches it and sleeps a longer cooldown (30s) before the next cycle. We classify by code/status, not message text. The one exception is chunk-too-large — provider error messages there vary too much for anything else to be reliable.

## RPC client setup

`FallbackProvider` wraps multiple RPC URLs for resilience to provider outages. A single-URL case bypasses `FallbackProvider` and uses one `JsonRpcProvider` directly.

A separate `JsonRpcBatchProvider` handles block-timestamp fetches inside `fetchAndParseChunk`. One chunk can fan out to dozens of `eth_getBlockByNumber` calls, and batching them into JSON-RPC arrays saves a lot of round trips. The batch provider uses only the first RPC URL because `JsonRpcBatchProvider` doesn't play well with `FallbackProvider`. Batch failures still go through `withRetry`, and a primary outage shows up in `fee_collector_rpc_errors_total{type="retry_exhausted"}` before users notice.

