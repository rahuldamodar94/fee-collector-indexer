import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "./cursor";

describe("cursor encode/decode", () => {
  it("round-trips a valid cursor", () => {
    const original = { blockNumber: 86889639, logIndex: 7 };
    const encoded = encodeCursor(original);
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(original);
  });

  it("throws on malformed cursor", () => {
    expect(() => decodeCursor("not-real-base64-!!!")).toThrow();
  });

  it("throws on wrong shape", () => {
    const encoded = Buffer.from(JSON.stringify({ blockNumber: 100 })).toString(
      "base64url",
    );
    expect(() => decodeCursor(encoded)).toThrow();
  });
});
