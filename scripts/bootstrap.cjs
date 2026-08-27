"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function log(message, color = colors.cyan) {
  console.log(`${color}${message}${colors.reset}`);
}

function step(title) {
  console.log(`${colors.bold}${colors.cyan}\n==> ${title}${colors.reset}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.inherit === false ? "pipe" : "inherit",
      shell: isWin,
      ...options,
      env: { ...process.env, ...(options.env || {}) },
    });

    if (options.inherit === false && child.stdout && child.stderr) {
      let out = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (out += d.toString()));
      child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(out || `Command failed: ${command}`))));
      return;
    }

    child.on("close", (code) => (code === 0 ? resolve("") : reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`))));
    child.on("error", reject);
  });
}

function requireNode() {
  const required = [22, 12];
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > required[0] || (major === required[0] && minor >= required[1]);
  if (!ok) {
    log(
      `Node.js ${required.join(".")} or newer is required. Found ${process.versions.node}. ` +
        `Install Node.js from https://nodejs.org before running this setup.`,
      colors.red,
    );
    process.exit(1);
  }
  log(`Node.js ${process.versions.node} detected.`, colors.green);
}

function fileExists(...parts) {
  return fs.existsSync(path.join(root, ...parts));
}

async function ensureInstall() {
  if (fileExists("node_modules")) {
    log("Dependencies already installed (node_modules present).", colors.green);
    return;
  }
  log("Installing dependencies (this may take a few minutes)...", colors.yellow);
  await run("npm", ["install"]);
  log("Dependencies installed.", colors.green);
}

async function ensureEnv() {
  if (!fileExists(".env") || !fileExists("frontend", ".env")) {
    log("Creating local environment files from .env.example...", colors.yellow);
    await run("node", ["scripts/prepare-workspace.cjs"]);
  }
  log("Environment files ready (.env / frontend/.env).", colors.green);
}

function readEnv(key) {
  try {
    const text = fs.readFileSync(path.join(root, ".env"), "utf8");
    const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

function probeMongo(uri) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(uri);
    } catch {
      return resolve(false);
    }
    const host = target.hostname;
    const port = Number(target.port) || 27017;
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function startMongo() {
  const configured = readEnv("MONGO_URI") || "mongodb://127.0.0.1:27017/pink_saas";

  const reachable = await probeMongo(configured);
  if (reachable) {
    log(`Using existing MongoDB at ${configured}`, colors.green);
    process.env.MONGO_URI = configured;
    return null;
  }

  log("No local MongoDB detected. Starting an auto-managed MongoDB instance...", colors.yellow);
  log("(First run downloads a MongoDB binary; this needs internet access and may take a bit.)", colors.yellow);

  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = require("mongodb-memory-server"));
  } catch {
    log(
      "Could not load mongodb-memory-server. Install MongoDB Community Edition and start it, " +
        "or set MONGO_URI in .env to a reachable MongoDB before running this setup.",
      colors.red,
    );
    process.exit(1);
  }

  const server = await MongoMemoryServer.create();
  const uri = server.getUri();
  process.env.MONGO_URI = uri;
  log(`Auto-managed MongoDB started at ${uri}`, colors.green);
  return server;
}

async function seed() {
  step("Seeding the first administrator (Super Admin)");
  await run("npm", ["run", "seed:super-admin"]);
}

let devChild = null;
let mongoServer = null;

async function startDev() {
  step("Starting gateway, services, and frontend");
  log("Open http://localhost:5173 when ready. Press Ctrl+C to stop everything.", colors.green);
  devChild = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });
}

function shutdown(signal) {
  log(`\n${signal} received. Stopping...`, colors.yellow);
  if (devChild) devChild.kill(signal);
  const finish = () => {
    if (mongoServer) {
      mongoServer.stop().then(() => process.exit(0)).catch(() => process.exit(0));
    } else {
      process.exit(0);
    }
  };
  if (devChild) {
    devChild.on("close", finish);
    setTimeout(finish, 8000);
  } else {
    finish();
  }
}

async function main() {
  console.log(
    `${colors.bold}${colors.cyan}\n==================================================\n` +
      `  Pink SaaS - One-Command Setup & Run\n` +
      `==================================================${colors.reset}`,
  );

  requireNode();
  await ensureInstall();
  await ensureEnv();
  mongoServer = await startMongo();
  await seed();
  await startDev();

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  log(`\nSetup failed: ${error.message}`, colors.red);
  if (mongoServer) mongoServer.stop().catch(() => {});
  process.exit(1);
});
