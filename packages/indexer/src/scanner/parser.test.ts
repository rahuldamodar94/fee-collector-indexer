import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { parseLog } from "./parser";

const FEES_COLLECTED_ABI = [
  "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)",
];

const iface = new ethers.utils.Interface(FEES_COLLECTED_ABI);

const timestamp = new Date("2026-05-15T10:00:00Z");

function makeLog(args: {
  token: string;
  integrator: string;
  integratorFee: string;
  lifiFee: string;
}): ethers.providers.Log {
  const encoded = iface.encodeEventLog("FeesCollected", [
    args.token,
    args.integrator,
    args.integratorFee,
    args.lifiFee,
  ]);

  return {
    blockNumber: 100,
    blockHash: "0x" + "a".repeat(64),
    transactionIndex: 0,
    removed: false,
    address: "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
    data: encoded.data,
    topics: encoded.topics,
    transactionHash: "0x" + "b".repeat(64),
    logIndex: 0,
  };
}

describe("parseLog", () => {
  it("parses a standard ERC20 FeesCollected event", () => {
    const log = makeLog({
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      integrator: "0x1234567890123456789012345678901234567890",
      integratorFee: "1000000000000000000",
      lifiFee: "100000000000000000",
    });

    const result = parseLog(log, 137, timestamp);

    expect(result.chainId).toBe(137);
    expect(result.token).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(result.integrator).toBe(
      "0x1234567890123456789012345678901234567890",
    );
    expect(result.integratorFee).toBe("1000000000000000000");
    expect(result.lifiFee).toBe("100000000000000000");
    expect(result.blockTimestamp).toEqual(timestamp);
  });

  it("parses native asset events with zero address as token", () => {
    const log = makeLog({
      token: "0x0000000000000000000000000000000000000000",
      integrator: "0x1234567890123456789012345678901234567890",
      integratorFee: "500000000000000000",
      lifiFee: "50000000000000000",
    });

    const result = parseLog(log, 137, timestamp);

    expect(result.token).toBe("0x0000000000000000000000000000000000000000");
    expect(result.integratorFee).toBe("500000000000000000");
    expect(result.lifiFee).toBe("50000000000000000");
  });

  it("preserves wei amounts larger than 2^53", () => {
    const hugeFee = "123456789012345678901234567890";
    const log = makeLog({
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      integrator: "0x1234567890123456789012345678901234567890",
      integratorFee: hugeFee,
      lifiFee: "1",
    });

    const result = parseLog(log, 137, timestamp);

    expect(result.integratorFee).toBe(hugeFee);
    expect(result.lifiFee).toBe("1");
  });
});
