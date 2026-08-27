const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  [".env.example", ".env"],
  ["frontend/.env.example", "frontend/.env"],
];

for (const [source, target] of files) {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(root, target);
  if (!fs.existsSync(targetPath) && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`[setup] Created ${target} from ${source}`);
  }
}

for (const directory of ["storage/pdfs", "frontend/public/org-embed"]) {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
}

console.log("[setup] Workspace dependencies and local runtime folders are ready.");
