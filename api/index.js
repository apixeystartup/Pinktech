const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const env = require("../src/config/env");

let isConnected = false;
let appInstance = null;

const frontendDist = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function ensureMongo() {
  if (isConnected) return;
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI);
  isConnected = true;
}

async function getApp() {
  if (!appInstance) {
    await ensureMongo();
    appInstance = require("../src/app");
  }
  return appInstance;
}

function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(frontendDist, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

function serveSPA(req, res) {
  const indexPath = path.join(frontendDist, "index.html");
  if (fs.existsSync(indexPath)) {
    res.setHeader("Content-Type", "text/html");
    fs.createReadStream(indexPath).pipe(res);
  } else {
    res.status(404).json({ message: "Not found" });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.url.startsWith("/api/")) {
      const app = await getApp();
      return app(req, res);
    }

    if (serveStatic(req, res)) return;

    return serveSPA(req, res);
  } catch (err) {
    console.error("Serverless function error:", err);
    return res.status(503).json({ message: "Service temporarily unavailable" });
  }
};
