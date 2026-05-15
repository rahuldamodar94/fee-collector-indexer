import { getLogger } from "@fee-collector/shared";

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

const tooLargePhrases = [
  "too many results",
  "log response size exceeded",
  "query returned more than",
  "exceeded max results",
  "request entity too large",
];

export function isChunkTooLarge(err: unknown): boolean {
  const e = err as { message?: string; status?: number; code?: string };
  const message = (e?.message ?? "").toLowerCase();
  const matchesPhrase = tooLargePhrases.some((p) => message.includes(p));
  const isTimeout = e?.status === 504 || e?.code === "TIMEOUT";
  return matchesPhrase || isTimeout;
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
      logger.warn("retry attempt", { attempt, err });
      const e = err as { status?: number; code?: string };
      const status = e?.status;
      const code = e?.code;

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

      const BASE = 500;
      const MAX = 30000;
      const delay =
        Math.min(MAX, BASE * 2 ** attempt) + Math.floor(Math.random() * 250);
      logger.debug("backoff before retry", { delayMs: delay });
      await sleep(delay);
    }
  }

  throw new RetryGiveupError(`retry gave up after ${maxRetries} attempts`);
}
