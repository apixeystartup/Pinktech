const ApiError = require("@pink/shared").ApiError;

function serviceAuthMiddleware(req, res, next) {
  const userId = req.headers["x-auth-user-id"];
  const tenantId = req.headers["x-auth-tenant-id"];
  const baseTenantId = req.headers["x-auth-base-tenant-id"];
  const permissionCodesRaw = req.headers["x-auth-permission-codes"];

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
    accountRole: req.headers["x-auth-account-role"] || "employee",
    isSuperAdmin: req.headers["x-auth-is-super-admin"] === "true",
    isAdmin:
      req.headers["x-auth-is-super-admin"] === "true" ||
      req.headers["x-auth-account-role"] === "tenant_admin",
  };
  req.tenantId = tenantId;

  return next();
}

module.exports = serviceAuthMiddleware;
