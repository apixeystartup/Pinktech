/**
 * One-time: drop old sparse unique on (tenantId, empCode) and apply partial unique index
 * so multiple users without an EMP ID no longer collide (E11000 dup on empCode: null).
 *
 * Usage: node src/scripts/fixUserEmpCodeIndex.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../config/env");
const User = require("../models/user.model");

async function main() {
  await mongoose.connect(env.MONGO_URI);
  const coll = mongoose.connection.collection("users");
  try {
    await coll.dropIndex("tenantId_1_empCode_1");
    // eslint-disable-next-line no-console
    console.log("Dropped index tenantId_1_empCode_1");
  } catch (err) {
    if (err.code !== 27 && err.codeName !== "IndexNotFound") {
      throw err;
    }
    // eslint-disable-next-line no-console
    console.log("Index tenantId_1_empCode_1 not present (ok)");
  }
  await User.syncIndexes();
  // eslint-disable-next-line no-console
  console.log("User indexes synced.");
  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
