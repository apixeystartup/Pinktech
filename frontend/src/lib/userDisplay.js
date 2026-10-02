function isSyntheticOrgEmail(addr) {
  const e = String(addr || "").toLowerCase();
  return (
    e.endsWith("@org-sheet.pink") || e.endsWith("@import.local") || e.endsWith("@tenant.pink.local")
  );
}

/** Prefer real workbook / official address for display (matches invite delivery ordering). */
export function displayAccountEmail(user) {
  if (!user) return "";
  const o = (user.orgContactEmail || "").trim();
  const login = (user.email || "").trim();
  const ol = o.toLowerCase();
  const ll = login.toLowerCase();
  if (o && !isSyntheticOrgEmail(ol)) return o;
  if (login && !isSyntheticOrgEmail(ll)) return login;
  return o || login || "";
}
