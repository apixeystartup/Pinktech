const ApiError = require("../common/errors/ApiError");

function tenantMiddleware(req, res, next) {
  if (!req.auth?.tenantId) {
    return next(new ApiError(403, "Tenant context missing"));
  }

  req.tenantId = req.auth.tenantId;
  return next();
}

module.exports = tenantMiddleware;
