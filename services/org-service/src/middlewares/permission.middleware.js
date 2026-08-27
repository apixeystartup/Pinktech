const ApiError = require("@pink/shared").ApiError;

function permissionMiddleware(permissionCodeOrCodes) {
  const required = Array.isArray(permissionCodeOrCodes) ? permissionCodeOrCodes : [permissionCodeOrCodes];
  return (req, res, next) => {
    const permissionCodes = req.auth?.permissionCodes || [];
    const ok = permissionCodes.includes("*") || required.some((code) => permissionCodes.includes(code));
    if (!ok) {
      const label = required.length === 1 ? required[0] : `one of: ${required.join(", ")}`;
      return next(new ApiError(403, `Missing permission: ${label}`));
    }
    return next();
  };
}

module.exports = permissionMiddleware;
