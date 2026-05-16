# fee-collector-indexer

Indexer and REST API for `FeesCollected` events emitted by the LiFi FeeCollector contract on Polygon. Events are persisted to MongoDB and exposed through an HTTP endpoint filterable by integrator.

The indexer scans the contract from a configured starting block, follows the chain head, and stores each event idempotently. The API serves events to clients with cursor-based pagination. Scope is intentionally narrow: one event type, one read endpoint, no write API.

## Architecture

```text
                            ┌──────────────┐
                            │  Polygon RPC │
                            │  (Tenderly / │
                            │   Ankr / …)  │
                            └──────┬───────┘
                                   │ eth_getLogs
                                   │ eth_getBlockByNumber
                                   ▼
   ┌──────────────────────────────────────────────────────┐
   │                       Indexer                        │
   │  - polls finalized head, scans chunks, parses logs   │
   │  - adaptive chunk sizing, retry with backoff         │
   │  - idempotent inserts via unique compound index      │
   └────────────────────────┬─────────────────────────────┘
                            │ insertMany / state save
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │                  MongoDB (single node)               │
   │  events       (chainId, tx, logIndex)   unique       │
   │  events       (integrator, blockNumber, logIndex)    │
   │  indexer_states     (chainId)           unique       │
   └────────────────────────┬─────────────────────────────┘
                            │ find + cursor pagination
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │                  API (Express)                       │
   │  GET /api/events?integrator=…&chainId=…&limit=…     │
   │  GET /api/health                                     │
   └────────────────────────┬─────────────────────────────┘
                            │ JSON
                            ▼
                         Client
```

Producer side: the indexer is a long-running Node process that polls a Polygon RPC for `FeesCollected` logs in chunks and writes them, along with its own cursor, to MongoDB. Storage: a single events collection with a unique compound index for idempotency and a secondary compound index for the integrator query, plus a separate `indexer_states` collection holding the per-chain cursor and parent block hash. Consumer side: an Express server with one read endpoint and cursor pagination. The indexer reads only up to the `finalized` tag and verifies the parent hash of each new chunk against its stored cursor; on mismatch it halts and waits for human investigation.

## Quick start

```bash
git clone https://github.com/rahuldamodar94/fee-collector-indexer.git
cd fee-collector-indexer
cp .env.example .env          # then edit RPC_URLS with your provider
docker compose up -d

# wait ~15 seconds for the indexer to start backfilling, then:
curl "http://localhost:3000/api/events?integrator=0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9&limit=5"
```

Expected response: JSON with `data` and `pagination`. If the integrator has no events yet, `data` is an empty array and `pagination.hasMore` is `false`.

See [`.env.example`](.env.example) for the full set of configurable variables and inline comments. `RPC_URLS` is the only value without a working default; everything else boots on `cp .env.example .env`. Inside Compose, `MONGO_URL` and `NODE_ENV` are overridden so the same `.env` also works for running outside Docker.

## API

### `GET /api/events`

Returns `FeesCollected` events filtered by integrator, newest first, paginated by cursor.

**Query parameters:**

| Param | Required | Type | Default | Description |
|---|---|---|---|---|
| `integrator` | yes | hex address | — | 0x-prefixed, case-insensitive. Lowercased server-side |
| `chainId` | no | integer | — | If omitted, returns events from every indexed chain |
| `limit` | no | integer | `50` | 1 to 200 |
| `cursor` | no | base64url | — | From the previous response, the `pagination.nextCursor` field |

**Response (200):**

```jsonc
{
  "data": [
    {
      "chainId": 137,
      "blockNumber": 79123456,
      "blockTimestamp": "2026-04-12T11:42:18.000Z",
      "transactionHash": "0x...",
      "logIndex": 47,
      "integrator": "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      "token": "0x0000000000000000000000000000000000000000",
      "integratorFee": "12345000000000000",
      "lifiFee": "23456000000000000"
    }
  ],
  "pagination": {
    "limit": 50,
    "hasMore": true,
    "nextCursor": "eyJibG9ja051bWJlciI6Nzkx..."
  }
}
```

**Error response (4xx):**

```jsonc
{
  "error": {
    "code": "bad_request",
    "message": "invalid query",
    "details": [
      {
        "code": "invalid_type",
        "path": ["integrator"],
        "message": "Required"
      }
    ]
  }
}
```

The cursor is opaque to the client. Internally it is base64url-encoded JSON `{ "blockNumber": number, "logIndex": number }`. The server validates the shape on every request and rejects malformed values with a `400`.

### `GET /api/health`

API container, port `3000`. Returns `200 { "status": "ok" }` when Mongo is reachable, `503 { "status": "unhealthy" }` otherwise.

### `GET /indexer/health` and `GET /indexer/metrics`

Indexer container, port `9090`. `/indexer/health` matches the API shape; `/indexer/metrics` exposes Prometheus default Node metrics in the standard text-exposition format.

## Data model

### `events`

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | |
| `blockNumber` | number | |
| `blockTimestamp` | Date | from `eth_getBlockByNumber` |
| `transactionHash` | string | |
| `logIndex` | number | |
| `integrator` | string | lowercased on insert |
| `token` | string | lowercased; `0x000...000` for native asset |
| `integratorFee` | string | wei as string (Number truncates above 2^53) |
| `lifiFee` | string | wei as string |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

Indexes:

- `(chainId, transactionHash, logIndex)` **unique**. Backs idempotent `insertMany({ ordered: false })`. Duplicate-key errors on retry are treated as success.
- `(integrator, blockNumber desc, logIndex desc)`. Backs the API query and cursor pagination.

### `indexer_states`

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | unique |
| `lastProcessedBlockNumber` | number | |
| `lastProcessedBlockHash` | string | used for parent-hash reorg check |
| `status` | enum | `running` or `halted` |
| `lastError` | string? | set only when halted |
| `lastErrorAt` | Date? | set only when halted |

One document per chain. The indexer reads on boot and writes after each successful chunk.

## Project structure

```text
.
├── packages/
│   ├── shared/        # env loader, mongoose models, logger, chain config
│   ├── indexer/       # polling loop, retry, chunk sizing, RPC provider
│   └── api/           # Express, routes/controllers/services/repositories
├── docker-compose.yml
├── .env.example
├── tsconfig.base.json
└── README.md
```

- `shared` holds Mongoose models, the Zod env schema, the Winston logger factory, and chain config types. Both other packages depend on it. Index creation via `syncIndexes()` is the responsibility of the indexer alone; the API is a pure reader of whatever schema state exists.
- `indexer` is a single Node process per chain. The scanner is one long-running loop; surrounding files handle RPC client setup, retry classification, and chunk-size adaptation.
- `api` follows a routes / controllers / services / repositories split. Validators use Zod; cursor encode and decode share a single utility.

## Running outside Docker

For step-through debugging or local iteration:

```bash
npm install
# in one terminal:
npx ts-node packages/indexer/src/index.ts
# in another:
npx ts-node packages/api/src/index.ts
```

Requires `.env` to have `MONGO_URL=mongodb://localhost:27017` (the value Compose overrides inside containers). A local Mongo instance on the default port is the simplest setup.

## Design decisions

Five decisions that shape the rest of the code.

**Finality-anchored indexing with panic halt on reorg.** The scanner reads only up to a safe head. On chains that expose a `finalized` tag (Polygon post-Rio, Ethereum), `FINALITY_STRATEGY=finalized` queries `eth_getBlockByNumber("finalized")`; on chains that do not, `FINALITY_STRATEGY=confirmations` uses `latestBlock - CONFIRMATION_DEPTH` as the safe head. On each new chunk the scanner fetches the first block and verifies its parent hash matches the stored cursor. On mismatch the scanner sets `status: halted` on the state document, records the conflicting hashes, and exits. The system does not roll back automatically. Optimistic indexing with rollback was the alternative; it adds a real branch of code that exists for a contingency that, under the finalized tag, should not happen. If finality reverses or an RPC misbehaves, human investigation is the right response.

**Idempotent inserts via a unique compound index, not Mongo transactions.** Each event row is uniquely identified by `(chainId, transactionHash, logIndex)`. The scanner uses `insertMany({ ordered: false })`, and on `BulkWriteError` treats duplicate-key entries as already-persisted. The combination yields exactly-once-effect delivery without a replica set. Transactions would have cost performance and infrastructure for no correctness gain.

**Separate `indexer_states` collection rather than deriving the cursor from `MAX(blockNumber)`.** Derived state cannot store the parent hash needed for the reorg check, and cannot distinguish "scanned and found zero events" from "never scanned." A single document per chain costs nothing and removes both ambiguities. It also gives a natural place to record `status`, `lastError`, and `lastErrorAt` when the scanner halts.

**Cursor pagination on `(blockNumber, logIndex)`, not `skip` / `limit`.** Offset pagination is O(N) on the skipped prefix and unstable when new events insert during a paginating session. The cursor is base64url-encoded JSON validated server-side; clients treat it as opaque. The compound index on `(integrator, blockNumber desc, logIndex desc)` makes the lookup index-served on every page.

The cursor deliberately does not include `chainId`. The compose default ships a single chain (Polygon), so the same `(blockNumber, logIndex)` pair cannot collide for one integrator. If multi-chain indexing is enabled later (one indexer process per chain, all writing to the same `events` collection), the `/api/events` query will be made stricter: `chainId` becomes a required query parameter so cross-chain queries are not possible in a single request. Putting `chainId` inside the cursor was the alternative; rejected because it complicates the cursor and serves a use case (cross-chain pagination for one integrator) that is not on the roadmap.

**Adaptive chunk sizing for `eth_getLogs`.** RPC providers cap response sizes differently and their error messages vary: "too many results", "log response size exceeded", "query returned more than 10000 results", plus HTTP 504 and ethers `TIMEOUT` when the response is genuinely too large to deliver in time. The scanner classifies all of these as "shrink the chunk", halves the size, and retries immediately without consuming the retry budget. After ten consecutive successes the chunk grows by 1.5x, capped at `MAX_CHUNK_SIZE`. Near the head it pins to `MIN_CHUNK_SIZE` for latency. Fixed sizing was the alternative; no single value works for both backfill (where you want large chunks for throughput) and head-following (where you want small chunks for latency).

## References

- FeeCollector contract on Polygon: [`0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9`](https://polygonscan.com/address/0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9)
- Event signature: `FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)`
- ABI source repo: [`github.com/lifinance/lifi-contract-types`](https://github.com/lifinance/lifi-contract-types) (not depended on; see [Design decisions](#design-decisions))

## Operational notes

**Ports.** API on `3000`, indexer health and metrics on `9090`, Mongo on host port `27018` (container-internal `27017`) so it coexists with a local `mongod` on `27017`, Prometheus UI on host port `9091`. Inside the compose network, services reach Mongo as `mongo:27017`. If host port `27018` is already in use, remap it in `docker-compose.yml`; the host-side port is the only knob.

**Metrics.** A Prometheus container ships in the same `docker-compose.yml`. It scrapes the indexer's `/indexer/metrics` and the API's `/api/metrics` on the compose network. The UI is available at `http://localhost:9091` after `docker compose up -d`. Today the app exposes only `prom-client`'s default Node metrics (event-loop lag, GC, memory); custom counters can be added without changing the Prometheus config.

**Graceful shutdown.** SIGTERM and SIGINT trigger a clean exit. The indexer flips an internal flag that breaks the scan loop between iterations, then disconnects Mongo. The API drains in-flight requests via `server.close` (with `closeIdleConnections` for keep-alive sockets), then disconnects Mongo. Both services exit with code 0 on a clean shutdown. The compose `stop_grace_period: 20s` gives Docker enough headroom past any reasonable cleanup before SIGKILL.

**Multi-chain.** The compose default ships Polygon only. To run a second chain, copy `.env` to `.env.ethereum`, change `CHAIN_ID`, `CHAIN_NAME`, `RPC_URLS`, and `START_BLOCK`, then `docker compose --env-file .env.ethereum up indexer`. One indexer process per chain by design: failure isolation and independent scaling.
