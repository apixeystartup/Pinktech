const dashboardService = require("../services/dashboard.service");

async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getDashboardStats(req.auth);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

async function getTenantEmployees(req, res, next) {
  try {
    const result = await dashboardService.getTenantEmployees(req.params.tenantId, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getTenantDoctors(req, res, next) {
  try {
    const result = await dashboardService.getTenantDoctors(req.params.tenantId, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { getStats, getTenantEmployees, getTenantDoctors };
