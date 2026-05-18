import mongoose from "mongoose";
import { getLogger } from "../logger";

export async function connectMongo(url: string, dbName: string): Promise<void> {
  const logger = getLogger();

  // Register handlers before connect so we catch the first "connected"
  // event. Mongoose also fires it on reconnect — no separate handler needed.
  mongoose.connection.on("connected", () => {
    logger.info("mongo connected");
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("mongo disconnected");
  });
  mongoose.connection.on("error", (err) => {
    logger.error("mongo connection error", { err });
  });

  await mongoose.connect(url, { dbName });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
