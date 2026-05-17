# DESIGN.md

Architectural decisions and trade-offs behind the fee-collector-indexer. Companion to the [README](./README.md): the README covers what the system does and how to run it; this document covers why the system is shaped the way it is.

## Five decisions

**Finality-anchored indexing with panic halt on reorg.** The scanner reads only up to a safe head (the `finalized` tag where available, otherwise `latest - CONFIRMATION_DEPTH`). On each new chunk it fetches the first block and verifies its parent hash matches the stored cursor. On mismatch the scanner sets `status: halted` on the state document, records the conflicting hashes, and exits. The system does not roll back automatically. Optimistic indexing with rollback was the alternative; it adds a real branch of code that exists for a contingency that, under the finalized tag, should not happen. If finality reverses or an RPC misbehaves, human investigation is the right response.

**Idempotent inserts via a unique compound index, not Mongo transactions.** Each event row is uniquely identified by `(chainId, transactionHash, logIndex)`. The scanner uses `insertMany({ ordered: false })`, and on `BulkWriteError` treats duplicate-key entries as already-persisted. The combination yields exactly-once-effect delivery without a replica set. Transactions would have cost performance and infrastructure for no correctness gain.

**Separate `indexer_states` collection rather than deriving the cursor from `MAX(blockNumber)`.** Derived state cannot store the parent hash needed for the reorg check, and cannot distinguish "scanned and found zero events" from "never scanned." A single document per chain costs nothing and removes both ambiguities. It also gives a natural place to record `status`, `lastError`, and `lastErrorAt` when the scanner halts.

**Cursor pagination on `(blockNumber, logIndex)`, not `skip` / `limit`.** Offset pagination is O(N) on the skipped prefix and unstable when new events insert during a paginating session. The cursor is base64url-encoded JSON validated server-side; clients treat it as opaque. The compound index on `(integrator, blockNumber desc, logIndex desc)` makes the lookup index-served on every page.

The cursor deliberately does not include `chainId`. If multi-chain indexing becomes a use case, `chainId` will be made a required query parameter rather than smuggled into the cursor — keeps the cursor opaque-and-stable and avoids cross-chain pagination semantics that are not on the roadmap.

**Adaptive chunk sizing for `eth_getLogs`.** RPC providers cap response sizes differently and their error messages vary: "too many results", "log response size exceeded", "query returned more than 10000 results", plus HTTP 504 and ethers `TIMEOUT` when the response is genuinely too large to deliver in time. The scanner classifies all of these as "shrink the chunk", halves the size, and retries immediately without consuming the retry budget. After ten consecutive successes the chunk grows by 1.5x, capped at `MAX_CHUNK_SIZE`. Near the head it pins to `MIN_CHUNK_SIZE` for latency. Fixed sizing was the alternative; no single value works for both backfill (where you want large chunks for throughput) and head-following (where you want small chunks for latency).

## Retry semantics

`withRetry` classifies errors before deciding to retry. Transient signals (HTTP 429/502/503, ethers `SERVER_ERROR`/`NETWORK_ERROR`/`ETIMEDOUT`, `ECONNRESET`/`ECONNREFUSED`) trigger exponential backoff with jitter, capped at 30 seconds, up to `MAX_RETRIES` attempts. Everything else throws immediately. When retries exhaust the budget, `withRetry` throws `RetryGiveupError`, which the scanner catches and treats as a longer cooldown (30s) before the next cycle. Classification is done by code/status inspection, not message text — the only carve-out is chunk-too-large in scanner code, where provider error phrasings diverge enough to make substring matching the pragmatic option.

## RPC client setup

The indexer uses `ethers.providers.JsonRpcProvider` rather than `StaticJsonRpcProvider` so that ethers verifies the RPC's reported chain ID against the configured `CHAIN_ID` and throws on mismatch. Misconfigured environments fail at boot instead of corrupting data. The cost is one `eth_chainId` call per provider lifetime, which is negligible.

`FallbackProvider` wraps multiple RPC URLs for resilience to provider outages. A single-URL case bypasses `FallbackProvider` and uses one `JsonRpcProvider` directly.

A separate `JsonRpcBatchProvider` handles block-timestamp fetches inside `fetchAndParseChunk`. A single chunk can fan out to dozens of `eth_getBlockByNumber` calls (one per event), and batching them into JSON-RPC arrays reduces RPC pressure significantly. The batch provider uses only the first RPC URL — `JsonRpcBatchProvider` does not interoperate cleanly with `FallbackProvider`. Acceptable trade-off: batch failures still fall back through `withRetry`, and an extended primary outage would surface in `fee_collector_rpc_errors_total{type="retry_exhausted"}` before user impact.

## Schema choices

**Wei amounts as strings, not numbers.** `integratorFee` and `lifiFee` are stored as strings. JavaScript's `Number` truncates above 2^53, which is well below typical wei values for popular tokens. Strings preserve the full precision and let the consumer parse to `BigNumber` (or any big-int type) as needed.

**`blockHash` deliberately omitted from each event row.** The reorg-detection path uses `lastProcessedBlockHash` on the per-chain `indexer_states` document, not per-event hashes. Storing 32 bytes per event for an unused field would waste disk at scale. If audit-trail forensics ever required it, the field can be added later via a Mongoose migration with no breaking change to existing data or consumers.
