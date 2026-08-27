const ApiError = require("@pink/shared").ApiError;
const kycLevel1CreatorMiddleware = require("./kycLevel1.middleware");

function orgExplorerReadMiddleware(req, res, next) {
  const codes = req.auth?.permissionCodes || [];
  if (codes.includes("*") || codes.includes("user.view") || codes.includes("tenant.manage")) {
    return next();
  }
  if (codes.includes("list.users")) {
    return kycLevel1CreatorMiddleware()(req, res, next);
  }
  return next(new ApiError(403, "Missing permission: user.view, list.users (level-1), or tenant.manage"));
}

module.exports = orgExplorerReadMiddleware;
