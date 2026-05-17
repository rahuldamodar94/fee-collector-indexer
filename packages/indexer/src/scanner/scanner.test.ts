import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";
import {
  createLogger,
  FeeCollectedEventModel,
  IndexerStateModel,
  type ChainConfig,
} from "@fee-collector/shared";

vi.mock("./rpc-client", () => ({
  createProvider: vi.fn(),
  createBatchProvider: vi.fn(),
}));

import {
  startScanner,
  requestScannerStop,
  __resetStopRequestedForTests,
} from "./scanner";
import { createProvider, createBatchProvider } from "./rpc-client";

const HEAD_HASH = "0x" + "a".repeat(64);
const PREV_HASH = "0x" + "b".repeat(64);

const integrator = "0x1234567890123456789012345678901234567890";
const token = "0x0000000000000000000000000000000000000000";

const config: ChainConfig = {
  chainId: 137,
  chainName: "polygon",
  rpcUrls: ["http://localhost:8545"],
  contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
  startBlock: 100,
  finalityStrategy: "finalized",
  confirmationDepth: 64,
  pollIntervalMs: 1,
  initialChunkSize: 2000,
  minChunkSize: 50,
  maxChunkSize: 5000,
  maxRetries: 5,
};

const iface = new ethers.utils.Interface([
  "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)",
]);
const eventFragment = iface.getEvent("FeesCollected");

function makeLog(opts: {
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  integratorFee?: string;
  lifiFee?: string;
}): ethers.providers.Log {
  const { data, topics } = iface.encodeEventLog(eventFragment, [
    token,
    integrator,
    opts.integratorFee ?? "1000",
    opts.lifiFee ?? "500",
  ]);
  return {
    blockNumber: opts.blockNumber,
    blockHash: HEAD_HASH,
    transactionIndex: 0,
    removed: false,
    address: config.contractAddress,
    data,
    topics,
    transactionHash: opts.transactionHash,
    logIndex: opts.logIndex,
  };
}

function setupProvider(overrides: {
  finalizedNumber?: number;
  logs?: ethers.providers.Log[];
  blockTimestamp?: number;
  blockHash?: string;
  parentHashByBlock?: Record<number, string>;
  stopAfterGetLogs?: boolean;
}) {
  const fake = {
    getBlock: vi.fn(),
    getBlockNumber: vi.fn(),
    getLogs: vi.fn(),
  };

  const finalizedNumber = overrides.finalizedNumber ?? 100;
  const blockHash = overrides.blockHash ?? HEAD_HASH;
  const timestamp = overrides.blockTimestamp ?? 1700000000;

  fake.getBlock.mockImplementation(async (tag: number | string) => {
    if (tag === "finalized") {
      return {
        number: finalizedNumber,
        hash: blockHash,
        parentHash: PREV_HASH,
        timestamp,
      };
    }
    const n = tag as number;
    return {
      number: n,
      hash: blockHash,
      parentHash: overrides.parentHashByBlock?.[n] ?? PREV_HASH,
      timestamp,
    };
  });

  fake.getBlockNumber.mockResolvedValue(finalizedNumber);

  fake.getLogs.mockImplementation(async () => {
    if (overrides.stopAfterGetLogs) {
      requestScannerStop();
    }
    return overrides.logs ?? [];
  });

  vi.mocked(createProvider).mockReturnValue(fake as never);
  vi.mocked(createBatchProvider).mockReturnValue(fake as never);

  return fake;
}

let mongod: MongoMemoryServer;

beforeAll(async () => {
  createLogger({ service: "test", level: "error" });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await IndexerStateModel.syncIndexes();
  await FeeCollectedEventModel.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  __resetStopRequestedForTests();
  await IndexerStateModel.deleteMany({});
  await FeeCollectedEventModel.deleteMany({});
  vi.clearAllMocks();
});

describe("startScanner", () => {
  it("creates an indexer_states doc on fresh boot and advances the cursor", async () => {
    setupProvider({ stopAfterGetLogs: true });

    await startScanner(config);

    const state = await IndexerStateModel.findOne({ chainId: 137 }).lean();
    expect(state).toBeTruthy();
    expect(state?.status).toBe("running");
    expect(state?.lastProcessedBlockNumber).toBe(100);
    expect(state?.lastProcessedBlockHash).toBe(HEAD_HASH);

    const eventCount = await FeeCollectedEventModel.countDocuments({});
    expect(eventCount).toBe(0);
  });

  it("inserts parsed events and advances the cursor in a normal cycle", async () => {
    const logs = [
      makeLog({
        blockNumber: 100,
        logIndex: 0,
        transactionHash: "0x" + "1".repeat(64),
        integratorFee: "1000",
        lifiFee: "500",
      }),
      makeLog({
        blockNumber: 100,
        logIndex: 1,
        transactionHash: "0x" + "2".repeat(64),
        integratorFee: "2000",
        lifiFee: "750",
      }),
    ];

    setupProvider({ logs, stopAfterGetLogs: true });

    await startScanner(config);

    const events = await FeeCollectedEventModel.find({})
      .sort({ logIndex: 1 })
      .lean();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      chainId: 137,
      integrator,
      token,
      transactionHash: "0x" + "1".repeat(64),
      logIndex: 0,
      blockNumber: 100,
      integratorFee: "1000",
      lifiFee: "500",
    });
    expect(events[1]?.integratorFee).toBe("2000");
    expect(events[1]?.lifiFee).toBe("750");

    const state = await IndexerStateModel.findOne({ chainId: 137 }).lean();
    expect(state?.lastProcessedBlockNumber).toBe(100);
    expect(state?.lastProcessedBlockHash).toBe(HEAD_HASH);
  });

  it("ignores duplicate (chainId, txHash, logIndex) inserts and still advances the cursor", async () => {
    const dupTx = "0x" + "1".repeat(64);

    await FeeCollectedEventModel.create({
      chainId: 137,
      integrator,
      blockNumber: 100,
      transactionHash: dupTx,
      logIndex: 0,
      blockTimestamp: new Date(1700000000 * 1000),
      token,
      integratorFee: "999",
      lifiFee: "999",
    });

    const logs = [
      makeLog({
        blockNumber: 100,
        logIndex: 0,
        transactionHash: dupTx,
        integratorFee: "1000",
        lifiFee: "500",
      }),
    ];

    setupProvider({ logs, stopAfterGetLogs: true });

    await startScanner(config);

    const events = await FeeCollectedEventModel.find({}).lean();
    expect(events).toHaveLength(1);
    expect(events[0]?.integratorFee).toBe("999");

    const state = await IndexerStateModel.findOne({ chainId: 137 }).lean();
    expect(state?.lastProcessedBlockNumber).toBe(100);
    expect(state?.lastProcessedBlockHash).toBe(HEAD_HASH);
  });

  it("halts and persists the error when the parent hash does not match", async () => {
    const stored = "0x" + "a".repeat(64);
    const observed = "0x" + "b".repeat(64);

    await IndexerStateModel.create({
      chainId: 137,
      lastProcessedBlockNumber: 99,
      lastProcessedBlockHash: stored,
      status: "running",
    });

    setupProvider({
      parentHashByBlock: { 100: observed },
    });

    await startScanner(config);

    const state = await IndexerStateModel.findOne({ chainId: 137 }).lean();
    expect(state?.status).toBe("halted");
    expect(state?.lastError).toContain(stored.toLowerCase());
    expect(state?.lastError).toContain(observed.toLowerCase());
    expect(state?.lastErrorAt).toBeInstanceOf(Date);
    expect(await FeeCollectedEventModel.countDocuments({})).toBe(0);
  });
});
