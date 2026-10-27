const tenantsService = require("../services/tenants.service");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");
const { PLATFORM_TENANT_CODES } = require("@pink/shared");

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
    const tenantIds = tenants.map((tenant) => tenant._id);
    const adminIds = tenants.map((tenant) => tenant.adminUserId).filter(Boolean);
    const adminEmails = tenants.map((tenant) => tenant.email).filter(Boolean);
    const adminUsers = await User.find({
      tenantId: { $in: tenantIds },
      $or: [{ _id: { $in: adminIds } }, { email: { $in: adminEmails } }],
    })
      .select("tenantId email status lockUntil loginAttempts")
      .lean();
    const adminByTenant = new Map();
    for (const tenant of tenants) {
      const admin = adminUsers.find((candidate) =>
        tenant.adminUserId
          ? String(candidate._id) === String(tenant.adminUserId)
          : String(candidate.tenantId) === String(tenant._id) &&
            String(candidate.email).toLowerCase() === String(tenant.email || "").toLowerCase(),
      );
      if (admin) adminByTenant.set(String(tenant._id), admin);
    }
    res.status(200).json(
      tenants.map((tenant) => {
        const admin = adminByTenant.get(String(tenant._id));
        return {
          ...tenant.toObject(),
          adminAccountStatus: admin?.status || null,
          adminLockUntil: admin?.lockUntil || null,
          adminLoginAttempts: admin?.loginAttempts || 0,
          adminUserId: admin?._id || tenant.adminUserId || null,
        };
      }),
    );
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

async function updateCurrentTenant(req, res, next) {
  try {
    const tenant = await tenantsService.updateOwnTenantProfile(req.auth.tenantId, req.body, req.auth);
    res.status(200).json(tenant);
  } catch (error) {
    next(error);
  }
}

async function unlockTenantAdmin(req, res, next) {
  try {
    const result = await tenantsService.unlockTenantAdmin(req.params.tenantId, req.auth);
    res.status(200).json({ message: "Tenant administrator account activated", ...result });
  } catch (error) {
    next(error);
  }
}

async function assignAccount(req, res, next) {
  try {
    const tenant = await tenantsService.assignTenantAccount(req.params.tenantId, req.body.userId, req.auth);
    res.status(200).json(tenant);
  } catch (error) {
    next(error);
  }
}

async function unassignAccount(req, res, next) {
  try {
    const tenant = await tenantsService.unassignTenantAccount(
      req.params.tenantId,
      req.body?.userId || "",
      req.auth
    );
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
    // Pinktech (the platform tenant) is the platform, not a customer tenant,
    // so its employees are not part of the per-tenant employee summary.
    const tenants = await Tenant.find({ code: { $nin: PLATFORM_TENANT_CODES } })
      .select("name code")
      .lean();
    const tenantMap = new Map(tenants.map((t) => [String(t._id), t]));

    const pipeline = [
      { $match: { orgFromWorkbook: true, orgLeftAt: null } },
      { $group: { _id: "$tenantId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];
    const groups = await User.aggregate(pipeline);

    const result = groups
      .filter((g) => tenantMap.has(String(g._id)))
      .map((g) => {
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
  updateCurrentTenant,
  unlockTenantAdmin,
  assignAccount,
  unassignAccount,
  deleteTenant,
  sendCreds,
  resetCreds,
  employeeSummary,
};
