const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const frontendDir = path.join(__dirname, "frontend");
const distDir = path.join(__dirname, "frontend", "dist");
const targetDir = path.join(__dirname, "api", "public");

try {
  console.log("Installing frontend deps in:", frontendDir);
  execSync("npm install --include=dev", { cwd: frontendDir, stdio: "inherit" });

  console.log("Running vite build...");
  execSync("node node_modules/vite/bin/vite.js build", { cwd: frontendDir, stdio: "inherit" });

  console.log("Copying dist to api/public...");
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
  fs.cpSync(distDir, targetDir, { recursive: true });

  console.log("Build complete!");
} catch (err) {
  console.error("BUILD FAILED:", err.message);
  process.exit(1);
}
