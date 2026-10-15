const ApiError = require("@pink/shared").ApiError;

// Org-directory writes (employees, reporting lines, roles, workbook imports)
// belong to the platform super admin alone. Tenant admins and employees get a
// read-only Explore: the gateway-classified account role decides, since
// access control is disabled.
function orgAdminMiddleware(req, res, next) {
  if (req.auth?.isSuperAdmin) return next();
  return next(new ApiError(403, "Only the platform super admin can change the org directory"));
}

module.exports = orgAdminMiddleware;
