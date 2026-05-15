import "reflect-metadata";
import dotenv from "dotenv";
import { loadEnv, connectMongo } from "@fee-collector/shared";
import app from "./app";
dotenv.config();

async function main() {
  const env = loadEnv();

  await connectMongo(env.MONGO_URL, env.MONGO_DB_NAME);

  app.listen(env.API_PORT, () => {
    console.log(`API listening on :${env.API_PORT}`);
  });
}

main().catch((err) => {
  console.error("API fatal error", err);
  process.exit(1);
});
