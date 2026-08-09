/**
 * Business rules: national vs geographic role scopes (Nutrimax-style sheet).
 * Applied after subtree-based scope inference so national titles stay ALL_INDIA
 * and geographic manager titles are not forced to ALL_INDIA just because the
 * holder is an org root.
 */

const { norm } = require("./orgNorm");

function normalizedNameAndAliases(role) {
  const parts = [];
  if (role?.name) parts.push(norm(role.name));
  for (const a of role.aliases || []) {
    if (a) parts.push(norm(a));
  }
  return parts.filter(Boolean);
}

/** Zonal / Regional / Area / Business Manager → confined geography (inferScope wins; not root-pinned ALL_INDIA). */
function isGeographicManagerRole(role) {
  const markers = [
    "zonal manager",
    "regional manager",
    "area manager",
    "business manager",
  ];
  return normalizedNameAndAliases(role).some((n) => markers.some((m) => n.includes(m)));
}

const NATIONAL_EXACT = new Set(["accounts", "administration", "adminstration"]);
const NATIONAL_ABBR = new Set(["vp", "nsm", "gm", "mm", "pm"]);

/**
 * VP/NSM/GM/MM/PM class + Accounts + Administration → ALL INDIA.
 * Abbrev tokens are matched as whole tokens (incl. sheet typo "Adminstration").
 */
function isNationalOrgScopeRole(role) {
  if (isGeographicManagerRole(role)) return false;

  const parts = normalizedNameAndAliases(role);
  for (const n of parts) {
    if (NATIONAL_EXACT.has(n)) return true;
    if (n.includes("vice president") || n.includes("national sales")) return true;
    if (/\bgeneral manager\b/.test(n)) return true;
    const toks = n.split(/[^a-z0-9]+/).filter(Boolean);
    for (const t of toks) {
      if (NATIONAL_ABBR.has(t)) return true;
    }
  }

  return false;
}

module.exports = {
  isGeographicManagerRole,
  isNationalOrgScopeRole,
};
