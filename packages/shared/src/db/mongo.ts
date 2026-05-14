import mongoose from "mongoose";

export async function connectMongo(url: string, dbName: string): Promise<void> {
  await mongoose.connect(url, { dbName });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
