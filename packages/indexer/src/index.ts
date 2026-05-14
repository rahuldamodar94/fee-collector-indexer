import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import {
  loadEnv,
  buildChainConfig,
  connectMongo,
  FeeCollectedEventModel,
  IndexerStateModel,
  createLogger,
} from "@fee-collector/shared";

import { startScanner } from "./scanner/scanner";
import { startHealthServer } from "./health-server";

async function main() {
  const env = loadEnv();
  const chainConfig = buildChainConfig(env);

  startHealthServer(env.HEALTH_PORT);

  const logger = createLogger({
    level: env.LOG_LEVEL,
    service: "indexer",
    chainId: chainConfig.chainId,
    chainName: chainConfig.chainName,
  });

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);
  await FeeCollectedEventModel.syncIndexes();
  await IndexerStateModel.syncIndexes();

  logger.info("boot complete, starting scanner");

  await startScanner(chainConfig);
}

main().catch((err) => {
  console.error("indexer error", err);
  process.exit(1);
});
