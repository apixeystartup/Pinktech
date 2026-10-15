const ApiError = require("@pink/shared").ApiError;

// Org management (employees, reporting lines, roles, workbook imports) is an
// admin surface. Access control is disabled — every account carries "*" — so the
// gateway-classified account role decides instead: a platform super admin or a
// tenant admin may change the org directory; everyone else gets a read-only view
// of their own team.
function orgAdminMiddleware(req, res, next) {
  if (req.auth?.isOrgAdmin) return next();
  return next(new ApiError(403, "Only an organization admin can change the org directory"));
}

module.exports = orgAdminMiddleware;
