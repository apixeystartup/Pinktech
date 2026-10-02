/**
 * Before `vite` dev server starts: build test/client into public/org-embed once if missing.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const marker = path.join(repoRoot, "frontend", "public", "org-embed", "index.html");

if (!fs.existsSync(marker)) {
  const clientDir = path.join(repoRoot, "test", "client");
  if (fs.existsSync(path.join(clientDir, "package.json"))) {
    console.info("[frontend] org-embed missing — building test/client …");
    execSync("npm run build:embed", { cwd: clientDir, stdio: "inherit" });
  } else {
    console.info("[frontend] org-embed missing — test/client not found, creating placeholder");
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "<!DOCTYPE html><html><head></head><body></body></html>");
  }
}
