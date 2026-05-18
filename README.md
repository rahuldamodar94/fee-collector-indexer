# fee-collector-indexer

[![CI](https://github.com/rahuldamodar94/fee-collector-indexer/actions/workflows/ci.yml/badge.svg)](https://github.com/rahuldamodar94/fee-collector-indexer/actions/workflows/ci.yml)

Indexer and REST API for `FeesCollected` events emitted by the LiFi FeeCollector contract on Polygon. Events are stored in MongoDB and served over HTTP, filterable by integrator.

The indexer scans the contract from a configured starting block, follows the chain head, and stores each event idempotently. The API serves events to clients with cursor-based pagination. Scope is narrow: one event type, one read endpoint, no write API.

## Architecture

```text
                            ┌──────────────┐
                            │  Polygon RPC │
                            │  (Tenderly / │
                            │   Ankr / …)  │
                            └──────┬───────┘
                                   │ getLogs
                                   │ getBlock
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

See [DESIGN.md](./DESIGN.md) for the architectural decisions and trade-offs that shape the rest of the code.

## Quick start

**You need a paid archive RPC.** Public and free-tier nodes either rate-limit or can't reach logs as far back as `START_BLOCK=78600000` (~8M blocks). Set `RPC_URLS` accordingly before running `npm start`.

```bash
git clone https://github.com/rahuldamodar94/fee-collector-indexer.git
cd fee-collector-indexer
cp .env.example .env          # then edit RPC_URLS with your provider
npm start                     # docker compose up -d --build

# wait ~15 seconds for the indexer to start backfilling, then:
curl "http://localhost:3000/api/events?integrator=0x4dd665c59007fd825d98fddabf7759f650f2ace0&chainId=137&limit=1"
```

Expected response: JSON with `data` and `pagination`. If the integrator has no events yet, `data` is an empty array and `pagination.hasMore` is `false`.

See [`.env.example`](.env.example) for all the configurable variables and inline comments. `RPC_URLS` is the only value without a working default; everything else boots on `cp .env.example .env`. Inside Compose, `MONGO_URL` and `NODE_ENV` are overridden so the same `.env` also works for running outside Docker.

## Common commands

Root `package.json` scripts wrap the most common operator actions:

| Command | What it does |
|---|---|
| `npm start` | Build images and start all services (`docker compose up -d --build`) |
| `npm stop` | Stop all services, keep data volumes (`docker compose down`) |
| `npm reset` | Stop and remove containers + volumes (wipes Mongo data) |
| `npm logs` | Tail all service logs (`docker compose logs -f`) |
| `npm test` | Run vitest across all packages |
| `npm run typecheck` | Run `tsc --noEmit` across all packages |

## API

### `GET /api/events`

Returns `FeesCollected` events filtered by integrator, newest first, paginated by cursor.

**Query parameters:**

| Param | Required | Type | Default | Description |
|---|---|---|---|---|
| `integrator` | yes | hex address | — | 0x-prefixed, case-insensitive. Lowercased server-side |
| `chainId` | yes | integer | — | Filter by chain. Cross-chain pagination isn't supported |
| `limit` | no | integer | `50` | 1 to 200 |
| `cursor` | no | base64url | — | From the previous response, the `pagination.nextCursor` field |

**Response (200):**

```jsonc
{
  "data": [
    {
      "chainId": 137,
      "integrator": "0x4dd665c59007fd825d98fddabf7759f650f2ace0",
      "blockNumber": 83705784,
      "transactionHash": "0xb948b5fc23c33534e94cdc7c658afb2e9d18e9cfc13c85828755bc171e214e3b",
      "logIndex": 38,
      "blockTimestamp": "2026-03-03T09:53:19.000Z",
      "token": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      "integratorFee": "25501",
      "lifiFee": "4500"
    }
  ],
  "pagination": {
    "limit": 1,
    "hasMore": true,
    "nextCursor": "eyJibG9ja051bWJlciI6ODM3MDU3ODQsImxvZ0luZGV4IjozOH0"
  }
}
```

**Error response (4xx):**

```jsonc
{
  "error": {
    "code": "bad_request",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "integrator",
        "message": "Required"
      }
    ]
  }
}
```

The cursor is opaque to the client. Internally it's base64url-encoded JSON `{ "blockNumber": number, "logIndex": number }`. The server checks the shape on every request and rejects malformed values with a `400`.

### `GET /api/health`

API container, port `3000`. Returns `200 { "status": "ok" }` when Mongo is reachable, `503 { "status": "unhealthy" }` otherwise.

### `GET /indexer/health` and `GET /indexer/metrics`

Indexer container, port `9090`. `/indexer/health` matches the API shape; `/indexer/metrics` exposes Prometheus default Node metrics plus a small set of custom counters and gauges (`fee_collector_events_ingested_total`, `fee_collector_chain_head_lag_blocks`, `fee_collector_rpc_errors_total`, `fee_collector_reorg_detected_total`).

## Data model

### `events`

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | |
| `blockNumber` | number | |
| `blockTimestamp` | Date | from `getBlock(number)` |
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
│   ├── shared/src/
│   │   ├── config/       # env loader, chain config
│   │   ├── db/           # mongoose models + connection
│   │   └── logger.ts
│   ├── indexer/src/
│   │   ├── scanner/      # polling loop, chunk sizer, rpc client, retry, parser
│   │   ├── health-server.ts
│   │   ├── metrics.ts
│   │   └── index.ts
│   └── api/src/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       ├── validators/
│       ├── middleware/   # request logger, metrics, error handler
│       ├── utils/        # cursor encode/decode, http errors
│       ├── app.ts
│       └── index.ts
├── infra/prometheus/
├── docker-compose.yml
├── .env.example
├── tsconfig.base.json
├── README.md
└── DESIGN.md
```

## Running outside Docker

For step-through debugging or local iteration:

```bash
npm install
# in one terminal:
npx ts-node packages/indexer/src/index.ts
# in another:
npx ts-node packages/api/src/index.ts
```

Requires `.env` to have `MONGO_URL=mongodb://localhost:27017` (Compose overrides this inside containers). Easiest setup: a local Mongo on the default port.

## Testing

```bash
npm test          # runs vitest across all packages
npm run typecheck # runs tsc --noEmit across all packages
```

Unit tests cover the pure modules: cursor encode and decode, retry classification, log parser, chunk sizer. Integration tests cover the API HTTP stack and the scanner against in-memory MongoDB via `mongodb-memory-server`. 29 tests total, runs in under 10 seconds locally.

## References

- FeeCollector contract on Polygon: [`0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9`](https://polygonscan.com/address/0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9)
- Event signature: `FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)`
- ABI source repo: [`github.com/lifinance/lifi-contract-types`](https://github.com/lifinance/lifi-contract-types) (not depended on; see [DESIGN.md](./DESIGN.md))

## Operational notes

**Ports.** API on `3000`, indexer health and metrics on `9090`, Mongo on host port `27018` (container-internal `27017`) so it coexists with a local `mongod` on `27017`, Prometheus UI on host port `9091`. Inside the compose network, services reach Mongo as `mongo:27017`. If host port `27018` is already in use, remap it in `docker-compose.yml`; the host-side port is the only knob.

**Metrics.** A Prometheus container ships in the same `docker-compose.yml`. It scrapes the indexer's `/indexer/metrics` and the API's `/api/metrics` on the compose network. The UI is available at `http://localhost:9091` after `docker compose up -d`. Both endpoints expose `prom-client`'s default Node metrics (event-loop lag, GC, memory) plus a custom set. Indexer: counters and gauges for events ingested, chain-head lag, RPC errors by type, and reorgs. API: `fee_collector_http_requests_total` counter and `fee_collector_http_request_duration_seconds` histogram, labeled by method/route/status.

**Graceful shutdown.** SIGTERM and SIGINT trigger a clean exit. The indexer flips an internal flag that breaks the scan loop between iterations, then disconnects Mongo. The API drains in-flight requests via `server.close` (with `closeIdleConnections` for keep-alive sockets), then disconnects Mongo. Both services exit with code 0 on a clean shutdown. The compose `stop_grace_period: 20s` is the SIGKILL timer — long enough for cleanup to finish.

**Multi-chain.** The compose default ships Polygon only. The image itself is chain-agnostic: every chain-specific knob (`CHAIN_ID`, `CHAIN_NAME`, `RPC_URLS`, `START_BLOCK`, `FINALITY_STRATEGY`, `POLL_INTERVAL_MS`) is env-driven. To run a second chain locally, copy `.env` to `.env.ethereum`, edit those values, and declare a second indexer service in `docker-compose.yml` pointing at the new env file:

```yaml
indexer-ethereum:
  build:
    context: .
    dockerfile: packages/indexer/Dockerfile
  env_file: .env.ethereum
  environment:
    MONGO_URL: mongodb://mongo:27017
    NODE_ENV: production
  depends_on:
    mongo:
      condition: service_healthy
  restart: on-failure:5
```

No code changes needed. In production, run one container per chain via whatever orchestrator you use; they share Mongo and the API. One indexer per chain keeps failures isolated and lets each chain scale independently.
