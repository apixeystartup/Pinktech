const Tenant = require("../../models/tenant.model");
const dashboardService = require("./dashboard.service");

async function getStats(req, res, next) {
  try {
    const { permissionCodes = [], tenantId, userId } = req.auth || {};
    const isAdmin = permissionCodes.includes("tenant.manage");

    if (isAdmin) {
      const tenant = await Tenant.findById(tenantId).select("code").lean();
      const isPlatform = tenant?.code === "PLATFORM";

      if (isPlatform && !req.auth.actingAsTenantId) {
        const stats = await dashboardService.getSuperAdminStats();
        return res.json(stats);
      }

      const stats = await dashboardService.getTenantAdminStats(tenantId);
      return res.json(stats);
    }

    const stats = await dashboardService.getEmployeeStats(tenantId, userId);
    return res.json(stats);
  } catch (error) {
    next(error);
  }
}

module.exports = { getStats };
