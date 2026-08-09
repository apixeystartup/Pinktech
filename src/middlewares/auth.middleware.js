const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const env = require("../config/env");
const ApiError = require("../common/errors/ApiError");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const Tenant = require("../models/tenant.model");
const permissionCatalog = require("../common/constants/permissions");

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, "Missing access token"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== "ACTIVE") {
      return next(new ApiError(401, "User not active"));
    }
    const homeTenant = await Tenant.findById(decoded.tenantId);
    if (!homeTenant || homeTenant.status !== "ACTIVE") {
      return next(new ApiError(403, "Tenant is inactive"));
    }

    const roles = await Role.find({
      _id: { $in: decoded.roleIds || [] },
      tenantId: decoded.tenantId,
    }).populate("permissionIds");

    const permissionCodes = [...new Set(roles.flatMap((role) => role.permissionIds.map((p) => p.code)))];
    const requestedTenantId = req.headers["x-tenant-id"];
    const canManageTenants = permissionCodes.includes("tenant.manage");

    let effectiveTenantId = decoded.tenantId;
    let effectivePermissionCodes = permissionCodes;
    let actingAsTenantId = null;

    if (requestedTenantId && String(requestedTenantId) !== String(decoded.tenantId)) {
      if (!mongoose.Types.ObjectId.isValid(requestedTenantId)) {
        return next(new ApiError(400, "Invalid tenant override header"));
      }
      if (!canManageTenants) {
        return next(new ApiError(403, "Tenant override is restricted to super admins"));
      }
      const homeTenant = await Tenant.findById(decoded.tenantId).select("code").lean();
      if (homeTenant?.code !== "PLATFORM") {
        return next(new ApiError(403, "Tenant override is restricted to platform super admins"));
      }
      const targetTenant = await Tenant.findById(requestedTenantId);
      if (!targetTenant || targetTenant.status !== "ACTIVE") {
        return next(new ApiError(403, "Target tenant is inactive"));
      }
      effectiveTenantId = String(requestedTenantId);
      actingAsTenantId = String(requestedTenantId);
      effectivePermissionCodes = permissionCatalog.map((item) => item.code);
    }

    req.auth = {
      ...decoded,
      tenantId: effectiveTenantId,
      baseTenantId: decoded.tenantId,
      actingAsTenantId,
      permissionCodes: effectivePermissionCodes,
    };
    return next();
  } catch {
    return next(new ApiError(401, "Invalid or expired access token"));
  }
}

module.exports = authMiddleware;
