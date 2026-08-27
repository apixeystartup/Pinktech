const tenantsService = require("../services/tenants.service");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");

async function createTenant(req, res, next) {
  try {
    const tenant = await tenantsService.createTenant(req.body, req.auth);
    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
}

async function listTenants(req, res, next) {
  try {
    const tenants = await tenantsService.listTenants();
    res.status(200).json(tenants);
  } catch (error) {
    next(error);
  }
}

async function getCurrentTenant(req, res, next) {
  try {
    const tenant = await tenantsService.getCurrentTenant(req.auth.tenantId);
    res.status(200).json(tenant);
  } catch (error) {
    next(error);
  }
}

async function updateTenant(req, res, next) {
  try {
    const tenant = await tenantsService.updateTenant(req.params.tenantId, req.body, req.auth);
    res.status(200).json(tenant);
  } catch (error) {
    next(error);
  }
}

async function deleteTenant(req, res, next) {
  try {
    await tenantsService.deleteTenant(req.params.tenantId, req.auth);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
}

async function sendCreds(req, res, next) {
  try {
    const result = await tenantsService.sendTenantCredentials(req.params.tenantId, req.auth);
    res.status(200).json({ message: "Credentials sent", email: result.email, tempPassword: result.tempPassword });
  } catch (error) {
    next(error);
  }
}

async function resetCreds(req, res, next) {
  try {
    const result = await tenantsService.resetTenantCredentials(req.params.tenantId, req.auth);
    res.status(200).json({ message: "Credentials reset and sent", email: result.email, tempPassword: result.tempPassword });
  } catch (error) {
    next(error);
  }
}

async function employeeSummary(req, res, next) {
  try {
    const tenants = await Tenant.find({}).select("name code").lean();
    const tenantMap = new Map(tenants.map((t) => [String(t._id), t]));

    const pipeline = [
      { $match: { orgFromWorkbook: true, orgLeftAt: null } },
      { $group: { _id: "$tenantId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];
    const groups = await User.aggregate(pipeline);

    const result = groups.map((g) => {
      const t = tenantMap.get(String(g._id));
      return {
        tenantId: g._id,
        tenantName: t?.name || "Unknown",
        tenantCode: t?.code || "",
        employeeCount: g.count,
      };
    });

    const totalEmployees = result.reduce((sum, r) => sum + r.employeeCount, 0);
    res.status(200).json({ totalEmployees, tenants: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTenant,
  listTenants,
  getCurrentTenant,
  updateTenant,
  deleteTenant,
  sendCreds,
  resetCreds,
  employeeSummary,
};
