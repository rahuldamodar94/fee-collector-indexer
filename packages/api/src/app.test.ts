import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createLogger, FeeCollectedEventModel } from "@fee-collector/shared";
import app from "./app";

const integrator = "0x1234567890123456789012345678901234567890";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  createLogger({ service: "test", level: "error" });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await FeeCollectedEventModel.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await FeeCollectedEventModel.deleteMany({});
});

type SeedInput = {
  blockNumber: number;
  logIndex?: number;
  chainId?: number;
  integrator?: string;
  transactionHash?: string;
  token?: string;
  integratorFee?: string;
  lifiFee?: string;
  blockTimestamp?: Date;
};

async function seedEvents(inputs: SeedInput[]): Promise<void> {
  const docs = inputs.map((e, i) => ({
    chainId: e.chainId ?? 137,
    integrator: e.integrator ?? integrator,
    blockNumber: e.blockNumber,
    transactionHash:
      e.transactionHash ??
      `0x${(i + 1).toString(16).padStart(64, "0")}`,
    logIndex: e.logIndex ?? 0,
    blockTimestamp: e.blockTimestamp ?? new Date("2026-01-01T00:00:00Z"),
    token: e.token ?? "0x0000000000000000000000000000000000000000",
    integratorFee: e.integratorFee ?? "1000",
    lifiFee: e.lifiFee ?? "500",
  }));
  await FeeCollectedEventModel.insertMany(docs);
}

describe("GET /api/events", () => {
  it("returns 400 when integrator is missing", async () => {
    const res = await request(app).get("/api/events");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "integrator" }),
      ]),
    );
  });

  it("returns 400 when integrator format is invalid", async () => {
    const res = await request(app)
      .get("/api/events")
      .query({ integrator: "not-an-address" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "integrator",
          message: "invalid integrator address",
        }),
      ]),
    );
  });

  it("returns 400 for a malformed cursor", async () => {
    const res = await request(app)
      .get("/api/events")
      .query({ integrator, cursor: "garbage!" });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "cursor", message: "invalid cursor" }),
      ]),
    );
  });

  it("returns empty data and null cursor for a valid query against an empty DB", async () => {
    const res = await request(app)
      .get("/api/events")
      .query({ integrator, chainId: 137 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      pagination: { limit: 50, hasMore: false, nextCursor: null },
    });
  });

  it("returns events newest first and omits internal mongoose fields", async () => {
    await seedEvents([
      { blockNumber: 100 },
      { blockNumber: 200 },
      { blockNumber: 300 },
    ]);

    const res = await request(app)
      .get("/api/events")
      .query({ integrator, chainId: 137 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map((e: { blockNumber: number }) => e.blockNumber)).toEqual([
      300, 200, 100,
    ]);

    const first = res.body.data[0];
    expect(first).not.toHaveProperty("_id");
    expect(first).not.toHaveProperty("__v");
    expect(first).not.toHaveProperty("createdAt");
    expect(first).not.toHaveProperty("updatedAt");
  });

  it("paginates through all events using nextCursor", async () => {
    await seedEvents([
      { blockNumber: 100 },
      { blockNumber: 200 },
      { blockNumber: 300 },
      { blockNumber: 400 },
      { blockNumber: 500 },
    ]);

    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;

    while (pages < 10) {
      pages += 1;
      const res = await request(app)
        .get("/api/events")
        .query({
          integrator,
          chainId: 137,
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });

      expect(res.status).toBe(200);
      for (const row of res.body.data) seen.push(row.blockNumber);

      if (!res.body.pagination.hasMore) {
        expect(res.body.pagination.nextCursor).toBeNull();
        break;
      }

      cursor = res.body.pagination.nextCursor;
      expect(cursor).toBeTruthy();
    }

    expect(seen).toEqual([500, 400, 300, 200, 100]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("filters by chainId when provided", async () => {
    await seedEvents([
      { blockNumber: 100, chainId: 137 },
      { blockNumber: 200, chainId: 137 },
      { blockNumber: 300, chainId: 1 },
      { blockNumber: 400, chainId: 1 },
    ]);

    const res = await request(app)
      .get("/api/events")
      .query({ integrator, chainId: 137 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const row of res.body.data) {
      expect(row.chainId).toBe(137);
    }
  });
});
