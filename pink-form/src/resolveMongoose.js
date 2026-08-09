const path = require("path");
const fs = require("fs");

/**
 * When pink-form lives inside the monorepo (`pink/pink-form`), use the parent app's
 * mongoose so models share the same connection. Standalone installs keep using
 * `pink-form/node_modules/mongoose`.
 */
function resolveMongoose() {
  const pinkFormRoot = path.join(__dirname, "..");
  const parentMongooseEntry = path.join(pinkFormRoot, "..", "node_modules", "mongoose", "index.js");
  if (fs.existsSync(parentMongooseEntry)) {
    return require(parentMongooseEntry);
  }
  return require("mongoose");
}

module.exports = resolveMongoose();
