const mongoose = require("./resolveMongoose");

async function connectDb() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required.");
  }

  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = { connectDb };
