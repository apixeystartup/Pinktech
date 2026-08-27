const mongoose = require("mongoose");
const logger = require("../logger");

const connectMongo = async (mongoUri) => {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  logger.info("MongoDB connected");
};

module.exports = { connectMongo };
