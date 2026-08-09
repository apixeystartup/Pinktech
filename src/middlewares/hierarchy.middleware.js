const ApiError = require("../common/errors/ApiError");
const { getSubtreePositionIds } = require("../modules/positions/hierarchy.service");

function hierarchyMiddleware(options = {}) {
  const getTargetPositionId =
    options.getTargetPositionId ||
    ((req) => req.params.positionId || req.body.positionId || req.query.positionId || null);

  return async (req, res, next) => {
    const permissionCodes = req.auth?.permissionCodes || [];
    const isAdminBypass = permissionCodes.includes("tenant.manage");
    if (isAdminBypass) {
      return next();
    }

    if (!req.auth?.positionId) {
      return next(new ApiError(403, "Current user is not assigned to a position"));
    }

    const targetPositionId = getTargetPositionId(req);
    if (!targetPositionId) {
      return next();
    }

    const allowedIds = await getSubtreePositionIds(req.tenantId, req.auth.positionId);
    const isAllowed = allowedIds.includes(String(targetPositionId));

    if (!isAllowed) {
      return next(new ApiError(403, "HBAC check failed for target position"));
    }

    return next();
  };
}

module.exports = hierarchyMiddleware;
