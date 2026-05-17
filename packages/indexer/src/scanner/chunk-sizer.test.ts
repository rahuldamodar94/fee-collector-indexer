import { describe, it, expect } from "vitest";
import { nextChunkSize, type ChunkState, isChunkTooLarge } from "./chunk-sizer";
import type { ChainConfig } from "@fee-collector/shared";

const config: ChainConfig = {
  chainId: 137,
  chainName: "polygon",
  rpcUrls: ["http://localhost"],
  contractAddress: "0x0000000000000000000000000000000000000000",
  startBlock: 0,
  finalityStrategy: "finalized",
  confirmationDepth: 64,
  pollIntervalMs: 2000,
  initialChunkSize: 2000,
  minChunkSize: 50,
  maxChunkSize: 5000,
  maxRetries: 5,
};

describe("nextChunkSize", () => {
  it("returns min chunk size when near head", () => {
    const state: ChunkState = { currentSize: 2000, consecutiveSuccess: 5 };
    const next = nextChunkSize("success", state, config, 50);
    expect(next.currentSize).toBe(50);
    expect(next.consecutiveSuccess).toBe(0);
  });

  it("shrinks chunk size by half on too-large", () => {
    const state: ChunkState = { currentSize: 2000, consecutiveSuccess: 7 };
    const next = nextChunkSize("too-large", state, config, 10000);
    expect(next.currentSize).toBe(1000);
    expect(next.consecutiveSuccess).toBe(0);
  });

  it("does not shrink below min on too-large", () => {
    const state: ChunkState = { currentSize: 80, consecutiveSuccess: 0 };
    const next = nextChunkSize("too-large", state, config, 10000);
    expect(next.currentSize).toBe(50);
  });

  it("increments success counter without changing size below threshold", () => {
    const state: ChunkState = { currentSize: 2000, consecutiveSuccess: 5 };
    const next = nextChunkSize("success", state, config, 10000);
    expect(next.currentSize).toBe(2000);
    expect(next.consecutiveSuccess).toBe(6);
  });

  it("grows chunk size by 1.5x when success threshold reached", () => {
    const state: ChunkState = { currentSize: 2000, consecutiveSuccess: 9 };
    const next = nextChunkSize("success", state, config, 10000);
    expect(next.currentSize).toBe(3000);
    expect(next.consecutiveSuccess).toBe(0);
  });

  it("does not grow above max chunk size", () => {
    const state: ChunkState = { currentSize: 4000, consecutiveSuccess: 9 };
    const next = nextChunkSize("success", state, config, 10000);
    expect(next.currentSize).toBe(5000);
    expect(next.consecutiveSuccess).toBe(0);
  });
});

describe("isChunkTooLarge", () => {
  it("matches 'too many results' phrase", () => {
    expect(isChunkTooLarge(new Error("too many results"))).toBe(true);
  });

  it("matches HTTP 504 status", () => {
    expect(isChunkTooLarge({ status: 504, message: "" })).toBe(true);
  });
});
