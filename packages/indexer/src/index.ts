import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import {
  loadEnv,
  buildChainConfig,
  connectMongo,
  FeeCollectedEventModel,
  IndexerStateModel,
} from "@fee-collector/shared";

import { startScanner } from "./scanner/scanner";

async function main() {
  const env = loadEnv();
  const chainConfig = buildChainConfig(env);

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);
  await FeeCollectedEventModel.syncIndexes();
  await IndexerStateModel.syncIndexes();

  console.log(
    `Started indexer for ${chainConfig.chainName} (chainId ${chainConfig.chainId})`,
  );

  await startScanner(chainConfig);
}

main().catch((err) => {
  console.error("indexer error", err);
  process.exit(1);
});
