const ApiError = require("@pink/shared").ApiError;

function accountAdminMiddleware(req, res, next) {
  if (req.auth?.isSuperAdmin || req.auth?.accountRole === "tenant_admin") {
    return next();
  }
  return next(new ApiError(403, "Only administrators can manage employee accounts"));
}

module.exports = accountAdminMiddleware;
