const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const requiredNode = [22, 12];
const [major, minor] = process.versions.node.split(".").map(Number);

if (major < requiredNode[0] || (major === requiredNode[0] && minor < requiredNode[1])) {
  console.error(`[dev] Node.js ${requiredNode.join(".")} or newer is required. Found ${process.versions.node}.`);
  process.exit(1);
}

const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) {
  console.error("[dev] Missing .env. Run npm install first to create it from .env.example.");
  process.exit(1);
}

const envText = fs.readFileSync(envPath, "utf8");
const mongoUri = envText.match(/^MONGO_URI=(.+)$/m)?.[1]?.trim();
if (!mongoUri) {
  console.error("[dev] MONGO_URI is missing from .env.");
  process.exit(1);
}

try {
  const command = process.platform === "win32" ? "where" : "which";
  execFileSync(command, ["mongod"], { stdio: "ignore" });
} catch {
  console.warn("[dev] mongod was not found on PATH. Start MongoDB separately or use a hosted MongoDB URI.");
}

console.log(`[dev] Prerequisites look good. Starting services with MongoDB at ${mongoUri}.`);
