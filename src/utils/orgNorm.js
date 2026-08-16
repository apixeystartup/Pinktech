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

/**
 * Generate name variants for fuzzy matching.
 * Handles: initials ("John A. Smith" → "john smith"), commas ("Smith, John" → "john smith"),
 * and extra prefixes/suffixes.
 */
function generateNameVariants(name) {
  const variants = new Set();
  const n = norm(name);
  if (!n) return variants;
  variants.add(n);

  const withoutDots = n.replace(/\./g, "").trim();
  if (withoutDots !== n) variants.add(withoutDots);

  const commaMatch = withoutDots.match(/^(\w+(?:\s+\w+)*)\s*,\s*(.+)$/);
  if (commaMatch) {
    const reordered = `${commaMatch[2]} ${commaMatch[1]}`.trim();
    variants.add(reordered);
  }

  const collapsedInitials = withoutDots.replace(/\b(\w)\s+(\w)/g, "$1 $2").replace(/\s+/g, " ").trim();
  if (collapsedInitials !== withoutDots) variants.add(collapsedInitials);

  const words = withoutDots.split(/\s+/).filter(Boolean);
  if (words.length > 2) {
    const noMiddle = `${words[0]} ${words[words.length - 1]}`;
    variants.add(noMiddle);
  }

  return variants;
}

module.exports = { norm, stripVacantSuffix, clean, titleCase, generateNameVariants };
