/** Display names for permission `module` keys (API returns English slugs). */
export const MODULE_TITLES = {
  auth: "Authentication",
  user: "Users & directory",
  employee: "Org assignments",
  role: "Roles & grants",
  position: "Positions",
  workflow: "Workflows",
  form: "Forms",
  report: "Reports & analytics",
  audit: "Audit & compliance",
  tenant: "Tenant administration",
  kyc: "KYC & identity",
  notification: "Notifications",
};

export function moduleTitle(moduleKey) {
  if (!moduleKey) return "Other";
  return MODULE_TITLES[moduleKey] || moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1);
}

/** Short title shown in pickers (falls back if API has not been re-seeded). */
export function permissionPrimaryLabel(p) {
  if (p?.label && String(p.label).trim()) return String(p.label).trim();
  if (!p?.code) return "";
  const parts = String(p.code).split(".");
  if (parts.length >= 2) return `${parts[0]} · ${parts.slice(1).join(" · ")}`;
  return p.code;
}
