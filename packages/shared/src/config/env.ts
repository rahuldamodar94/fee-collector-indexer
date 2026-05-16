import { z } from "zod";

const EnvSchema = z.object({
  // Mongo
  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().default("fee-collector"),

  // Indexer
  CHAIN_ID: z.coerce.number().int().positive(),
  CHAIN_NAME: z.string().min(1),
  RPC_URLS: z.string().min(1),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  START_BLOCK: z.coerce.number().int().nonnegative(),
  FINALITY_STRATEGY: z.enum(["finalized", "confirmations"]),
  CONFIRMATION_DEPTH: z.coerce.number().int().nonnegative().default(64),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  INITIAL_CHUNK_SIZE: z.coerce.number().int().positive().default(2000),
  MIN_CHUNK_SIZE: z.coerce.number().int().positive().default(50),
  MAX_CHUNK_SIZE: z.coerce.number().int().positive().default(5000),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(5),
  HEALTH_PORT: z.coerce.number().int().positive().default(9090),

  // API
  API_PORT: z.coerce.number().int().positive().default(3000),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment variable validation failed:\n${issues}`);
  }
  return parsed.data;
}
