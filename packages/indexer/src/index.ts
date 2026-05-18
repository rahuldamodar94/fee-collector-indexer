// Required by @typegoose/typegoose at runtime. Must load before any model.
import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import {
  loadEnv,
  buildChainConfig,
  connectMongo,
  disconnectMongo,
  FeeCollectedEventModel,
  IndexerStateModel,
  createLogger,
} from "@fee-collector/shared";

import { startScanner, requestScannerStop } from "./scanner/scanner";
import { startHealthServer } from "./health-server";

async function main() {
  const env = loadEnv();
  const chainConfig = buildChainConfig(env);

  const logger = createLogger({
    level: env.LOG_LEVEL,
    service: "indexer",
    chainId: chainConfig.chainId,
    chainName: chainConfig.chainName,
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, stopping scanner");
    requestScannerStop();
  });
  process.on("SIGINT", () => {
    logger.info("SIGINT received, stopping scanner");
    requestScannerStop();
  });

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);
  await FeeCollectedEventModel.syncIndexes();
  await IndexerStateModel.syncIndexes();

  startHealthServer(env.HEALTH_PORT);

  logger.info("boot complete, starting scanner");

  await startScanner(chainConfig);

  await disconnectMongo();
  logger.info("shutdown complete");
  process.exit(0);
}

main().catch((err) => {
  // logger may not be initialized if loadEnv failed; fall back to console
  console.error("indexer fatal error", err);
  process.exit(1);
});
