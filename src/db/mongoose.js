const mongoose = require("mongoose");
const env = require("../config/env");
const logger = require("../common/logger");

const connectMongo = async () => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI);
  logger.info("MongoDB connected");
};

module.exports = {
  connectMongo,
};
