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
  console.info("[frontend] org-embed missing — running npm run build:org-embed …");
  execSync("npm run build:org-embed", { cwd: repoRoot, stdio: "inherit" });
}
