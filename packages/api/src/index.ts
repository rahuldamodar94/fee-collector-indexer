import "reflect-metadata";
import dotenv from "dotenv";
import {
  loadEnv,
  connectMongo,
  disconnectMongo,
  createLogger,
} from "@fee-collector/shared";
import app from "./app";
dotenv.config();

async function main() {
  const env = loadEnv();

  const logger = createLogger({
    level: env.LOG_LEVEL,
    service: "api",
  });

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);

  const server = app.listen(env.API_PORT, () => {
    logger.info("api listening", { port: env.API_PORT });
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, draining server`);
    server.closeIdleConnections();
    server.close(async (err) => {
      if (err) logger.error("server close error", { err });
      await disconnectMongo();
      logger.info("shutdown complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  // logger may not be initialized if loadEnv failed; fall back to console
  console.error("API fatal error", err);
  process.exit(1);
});
