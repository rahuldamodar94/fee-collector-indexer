import { getLogger } from "@fee-collector/shared";

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
  const logger = getLogger();
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; code?: string };
      const status = e?.status;
      const code = e?.code;

      // 504 and TIMEOUT aren't here on purpose — in practice they mean
      // "response too big", so isChunkTooLarge handles them at the call site
      // by shrinking the chunk instead.
      const isTransient =
        status === 429 ||
        status === 502 ||
        status === 503 ||
        code === "SERVER_ERROR" ||
        code === "NETWORK_ERROR" ||
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT";

      if (!isTransient) throw err;

      logger.warn("retry attempt", { attempt, err });
      const BASE = 500;
      const MAX = 30000;
      const delay =
        Math.min(MAX, BASE * 2 ** attempt) + Math.floor(Math.random() * 250);
      logger.debug("backoff before retry", { delayMs: delay });
      await sleep(delay);
    }
  }

  getLogger().error("retry budget exhausted", { attempts: maxRetries });
  throw new RetryGiveupError(`retry gave up after ${maxRetries} attempts`);
}
