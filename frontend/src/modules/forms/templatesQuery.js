import api from "../../lib/api";

// Templates are per tenant (X-Tenant-Id), so the cache key follows the
// header override the same way the old per-mount fetch did.
export const templatesKey = (tenantKey) => ["form-templates", String(tenantKey || "")];

export async function fetchTemplates() {
  const res = await api.get("/forms/templates");
  return Array.isArray(res.data) ? res.data : [];
}
