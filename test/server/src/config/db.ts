import mongoose from 'mongoose';
import { env } from './env';

let connected = false;

export async function connectDb(uri: string = env.mongoUri): Promise<void> {
  if (connected) return;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });
  connected = true;
}

export async function disconnectDb(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

export function isConnected(): boolean {
  return connected;
}
