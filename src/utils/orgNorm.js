/** Lowercase, collapse whitespace — matches test/server norm.ts behaviour. */
function norm(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\t\n]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const VACANT_SUFFIXES = [/\s*-\s*vacant\s*$/i, /\s*\(\s*vacant\s*\)\s*$/i];

function stripVacantSuffix(name) {
  let out = String(name || "");
  for (const pat of VACANT_SUFFIXES) out = out.replace(pat, "");
  return out.trim();
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/[\t\n]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return text || null;
}

function titleCase(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

module.exports = { norm, stripVacantSuffix, clean, titleCase };
