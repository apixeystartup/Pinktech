import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const pink = path.join(root, "pink-form", "frontend", "src", "index.css");
const outPath = path.join(root, "frontend", "src", "styles", "schema-forms.css");

const src = fs.readFileSync(pink, "utf8");
const lines = src.split(/\n/);

const chunks = [];
for (let i = 166; i <= 750; i++) {
  if (lines[i] === undefined) break;
  chunks.push(lines[i]);
}

/** Lines that are property:value blocks (or closers); do not prefix with .schema-forms */
function isLikelyCssDeclaration(line) {
  const t = line.trim();
  if (!t || t === "}" || t.startsWith("/*")) return true;
  if (t.startsWith("@")) return true;
  if (t.includes("{")) return false;
  if (t.endsWith(",")) return false;
  // Custom props, vendor-prefixed props (-webkit-…), and standard props
  return /^(--[\w-]+|-[a-zA-Z][\w-]*|[a-zA-Z][\w-]*)\s*:/.test(t);
}

function prefixLine(line) {
  const t = line.trim();
  if (!t) return line;
  if (t.startsWith("/*") || t === "*/") return line;
  if (t.startsWith("@media")) return line;
  if (isLikelyCssDeclaration(line)) return line;
  const m = line.match(/^(\s*)(.+)$/);
  if (!m) return line;
  const sp = m[1];
  const rest = m[2];
  if (rest.startsWith(".schema-forms")) return line;
  if (rest.startsWith("}")) return line;
  return `${sp}.schema-forms ${rest}`;
}

const body = chunks.map(prefixLine).join("\n");

const header = `/* Scoped form builder + renderer (rebuilt from pink-form tokens, indigo accent) */
.schema-forms {
  --sf-bg: #e8edf5;
  --sf-surface: rgba(255, 255, 255, 0.92);
  --sf-text: #0f172a;
  --sf-text-secondary: #64748b;
  --sf-border: rgba(15, 23, 42, 0.1);
  --sf-border-focus: #4f46e5;
  --sf-accent: #4f46e5;
  --sf-accent-hover: #4338ca;
  --sf-accent-soft: rgba(99, 102, 241, 0.12);
  --sf-accent-ring: rgba(79, 70, 229, 0.28);
  --sf-danger: #dc2626;
  --sf-danger-soft: #fef2f2;
  --sf-success: #059669;
  --sf-success-soft: #ecfdf5;
  --sf-radius: 10px;
  --sf-radius-lg: 14px;
  --sf-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --sf-shadow-md: 0 8px 28px rgba(15, 23, 42, 0.08);
  --sf-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --text: var(--sf-text);
  --text-secondary: var(--sf-text-secondary);
  --border: var(--sf-border);
  --border-focus: var(--sf-border-focus);
  --accent: var(--sf-accent);
  --accent-hover: var(--sf-accent-hover);
  --accent-soft: var(--sf-accent-soft);
  --accent-ring: var(--sf-accent-ring);
  --danger: var(--sf-danger);
  --danger-soft: var(--sf-danger-soft);
  --success: var(--sf-success);
  --success-soft: var(--sf-success-soft);
  --radius: var(--sf-radius);
  --radius-lg: var(--sf-radius-lg);
  --shadow-sm: var(--sf-shadow-sm);
  --shadow-md: var(--sf-shadow-md);
  --mono: var(--sf-mono);
}

.schema-forms--public {
  min-height: 100vh;
  padding: 1.5rem 1rem 2.5rem;
  background: var(--sf-bg);
}

.schema-forms__public-card {
  max-width: 880px;
  margin: 0 auto;
  background: var(--sf-surface);
  border-radius: var(--sf-radius-lg);
  border: 1px solid var(--sf-border);
  box-shadow: var(--sf-shadow-md);
  padding: 1.35rem 1.5rem 1.75rem;
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.schema-forms__public-header h1 {
  margin: 0 0 0.35rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--sf-text);
}

.schema-forms__modules-section {
  margin-bottom: 1.5rem;
}

.schema-forms__modules-heading {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--sf-text);
}

.schema-forms__modules-lead {
  margin: 0 0 1rem;
}

.schema-forms-module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.schema-forms-module-card {
  border-radius: var(--sf-radius-lg);
  padding: 1rem 1.1rem;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--sf-border);
  box-shadow: var(--sf-shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  backdrop-filter: blur(12px);
}

.schema-forms-module-card:hover {
  border-color: color-mix(in srgb, var(--sf-accent) 28%, var(--sf-border));
  box-shadow: var(--sf-shadow-md);
  transform: translateY(-2px);
}

.schema-forms-module-card--active {
  border-color: var(--sf-accent);
  box-shadow: 0 0 0 2px var(--sf-accent-ring);
}

.schema-forms-module-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.schema-forms-module-card__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--sf-text);
}

.schema-forms-module-card__badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: var(--sf-text-secondary);
  border: 1px solid var(--sf-border);
}

.schema-forms-module-card__badge--live {
  background: var(--sf-success-soft);
  color: var(--sf-success);
  border-color: color-mix(in srgb, var(--sf-success) 25%, var(--sf-border));
}

.schema-forms-module-card__meta {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  color: var(--sf-text-secondary);
}

.schema-forms-module-card__url {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  word-break: break-all;
  color: var(--sf-text-secondary);
  font-family: var(--sf-mono);
}

.schema-forms-module-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.schema-forms__responses-title {
  margin: 1.25rem 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--sf-text);
}

`;

const footer = `
.schema-forms .link {
  color: var(--sf-accent);
  font-weight: 600;
  text-decoration: none;
}
.schema-forms .link:hover {
  text-decoration: underline;
}

.schema-forms .inputRadio {
  width: 1.1rem;
  height: 1.1rem;
  min-width: 1.1rem;
  margin: 0 0.45rem 0 0;
  accent-color: var(--sf-accent);
  cursor: pointer;
  vertical-align: middle;
}

.schema-forms input[type="file"].inputFile,
.schema-forms input[type="file"].inputElevated {
  padding: 0.55rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
  border-style: dashed;
  background: color-mix(in srgb, var(--sf-accent-soft) 35%, #fff);
}

.schema-forms textarea.inputElevated {
  min-height: 6.5rem;
  resize: vertical;
  line-height: 1.45;
}
`;

fs.writeFileSync(outPath, header + "\n" + body + "\n" + footer + "\n");
console.log("Wrote", outPath);
