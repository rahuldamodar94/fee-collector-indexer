import { describe, it, expect, vi, beforeAll } from "vitest";
import { withRetry, RetryGiveupError } from "./retry";

import { createLogger } from "@fee-collector/shared";

beforeAll(() => {
  createLogger({ service: "test", level: "error" });
});

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, 5);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors and eventually succeeds", async () => {
    const transientError = Object.assign(new Error("server error"), {
      code: "SERVER_ERROR",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 5);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws RetryGiveupError after exhausting retries on transient errors", async () => {
    const transientError = Object.assign(new Error("server error"), {
      code: "SERVER_ERROR",
    });
    const fn = vi.fn().mockRejectedValue(transientError);

    await expect(withRetry(fn, 3)).rejects.toThrow(RetryGiveupError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws non-transient errors immediately without retrying", async () => {
    const fatalError = Object.assign(new Error("bad request"), {
      status: 400,
    });
    const fn = vi.fn().mockRejectedValue(fatalError);

    await expect(withRetry(fn, 5)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
