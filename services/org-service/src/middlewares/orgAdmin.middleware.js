const ApiError = require("@pink/shared").ApiError;

// Org-directory writes (adding and editing people, reporting lines, workbook
// imports, reload) belong to an org admin: the platform super admin, or the
// tenant's own admin acting inside its own organization. The gateway-classified
// account role decides, since access control is disabled — and the gateway
// refuses a tenant override to anyone but a super admin, so a tenant admin can
// never reach another tenant's directory.
function orgAdminMiddleware(req, res, next) {
  if (req.auth?.isSuperAdmin || req.auth?.accountRole === "tenant_admin") return next();
  return next(new ApiError(403, "Only an org admin can change the org directory"));
}

// Platform-wide sweeps (a full hierarchy reset, a workbook rollback) and the
// role catalog stay with the platform super admin alone: they reshape every
// tenant's structure, not just the caller's own.
function superAdminMiddleware(req, res, next) {
  if (req.auth?.isSuperAdmin) return next();
  return next(new ApiError(403, "Only the platform super admin can run this"));
}

module.exports = { orgAdminMiddleware, superAdminMiddleware };
