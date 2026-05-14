import dotenv from "dotenv";
dotenv.config();

import {
  loadEnv,
  buildChainConfig,
  connectMongo,
  FeeCollectedModel,
  IndexerStateModel,
} from "@fee-collector/shared";

async function main() {
  const env = loadEnv();
  const chainConfig = buildChainConfig(env);

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);
  await FeeCollectedModel.syncIndexes();
  await IndexerStateModel.syncIndexes();

  console.log(
    `indexer started for ${chainConfig.chainName} (chainId ${chainConfig.chainId})`,
  );
}
