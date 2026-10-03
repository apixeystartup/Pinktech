const mongoose = require("mongoose");
const logger = require("../logger");

/**
 * Connection pool sizing.
 *
 * Every microservice runs as its own process and opens its own pool. Mongoose
 * defaults maxPoolSize to 100, so an unpinned deployment of 8 services plus the
 * gateway can present ~900 connections. MongoDB Atlas Free clusters cap out at
 * 500, so a busy period silently turns into "too many connections" errors.
 *
 * Default of 20 keeps the whole fleet (~180) comfortably inside that ceiling.
 */
const POOL_OPTIONS = {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: 10000,
};

const connectMongo = async (mongoUri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, POOL_OPTIONS);
  logger.info({ maxPoolSize: POOL_OPTIONS.maxPoolSize }, "MongoDB connected");
};

module.exports = { connectMongo, POOL_OPTIONS };
