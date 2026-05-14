export class ChunkTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkTooLargeError";
  }
}

export class RetryGiveupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryGiveupError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log("Error caught and retrying: ", err);
      const e = err as { message?: string; status?: number; code?: string };
      const message = e?.message ?? "";
      const status = e?.status;
      const code = e?.code;

      if (message.toLowerCase().includes("too many results")) {
        throw new ChunkTooLargeError("chunk too large");
      }

      const isTransient =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        code === "SERVER_ERROR" ||
        code === "NETWORK_ERROR" ||
        code === "TIMEOUT" ||
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT";

      if (!isTransient) throw err;

      const delay = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      console.log("Retrying after: ", delay, " milli seconds");
      await sleep(delay);
    }
  }

  throw new RetryGiveupError(`retry gave up after ${maxRetries} attempts`);
}
