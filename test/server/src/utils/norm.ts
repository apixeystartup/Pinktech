/**
 * Shared string normalisation. Used by alias matching in role discovery and
 * by manager-name resolution in the position builder.
 *
 *   norm("  General  Manager  ")    -> "general manager"
 *   norm("BUSINESS MANAGER -Vacant") -> "business manager -vacant"
 *
 * Lowercases, replaces tabs / newlines with spaces, collapses whitespace,
 * trims. ``stripVacantSuffix`` additionally drops an unfilled-position
 * marker like " -Vacant" or "(VACANT)".
 */
export function norm(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\t\n]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const VACANT_SUFFIXES = [
  /\s*-\s*vacant\s*$/i,
  /\s*\(\s*vacant\s*\)\s*$/i,
];

export function stripVacantSuffix(name: string): string {
  let out = name;
  for (const pat of VACANT_SUFFIXES) out = out.replace(pat, '');
  return out.trim();
}

export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[\t\n]/g, ' ').trim().replace(/\s+/g, ' ');
  return text || null;
}

/** Title-case all-caps designations into a nicer display name. Acronyms
 * (3 chars or fewer) are preserved. */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
