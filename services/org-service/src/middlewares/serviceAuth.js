const ApiError = require("@pink/shared").ApiError;

function serviceAuthMiddleware(req, res, next) {
  const userId = req.headers["x-auth-user-id"];
  const tenantId = req.headers["x-auth-tenant-id"];
  const baseTenantId = req.headers["x-auth-base-tenant-id"];
  const permissionCodesRaw = req.headers["x-auth-permission-codes"];
  const isSuperAdmin = req.headers["x-auth-is-super-admin"] === "true";
  // Access control is disabled, so permission codes are "*" for every account.
  // The gateway classifies the account instead: super_admin (Pinktech),
  // tenant_admin, or employee.
  const accountRole = req.headers["x-auth-account-role"] || "employee";

  if (!userId || !tenantId) {
    return next(new ApiError(401, "Missing auth context from gateway"));
  }

  let permissionCodes;
  try {
    permissionCodes = JSON.parse(permissionCodesRaw || "[]");
  } catch {
    permissionCodes = [];
  }

  req.auth = {
    userId,
    tenantId,
    baseTenantId: baseTenantId || tenantId,
    actingAsTenantId: tenantId !== baseTenantId ? tenantId : null,
    permissionCodes,
    isSuperAdmin,
    accountRole,
    // Admins see the whole organization; everyone else only their own team.
    isOrgAdmin: isSuperAdmin || accountRole === "tenant_admin",
  };
  req.tenantId = tenantId;

  return next();
}

module.exports = serviceAuthMiddleware;
