const User = require("../models/user.model");
const Role = require("../models/role.model");
const ApiError = require("../common/errors/ApiError");

/**
 * External KYC user lifecycle is limited to employees whose primary org role effective level is 1
 * (field / first-line managers). `tenant.manage` bypasses.
 */
function kycLevel1CreatorMiddleware() {
  return async (req, res, next) => {
    try {
      const codes = req.auth?.permissionCodes || [];
      if (codes.includes("tenant.manage")) {
        return next();
      }

      const user = await User.findById(req.auth.userId).populate("roleIds");
      if (!user) {
        return next(new ApiError(403, "User not found"));
      }

      const roles = user.roleIds || [];
      const hasLevel1 = roles.some((r) => Role.effectiveLevel(r) === 1);
      if (!hasLevel1) {
        return next(
          new ApiError(
            403,
            "Only employees with an org role at level 1 may create, edit, or verify external KYC users.",
          ),
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = kycLevel1CreatorMiddleware;
