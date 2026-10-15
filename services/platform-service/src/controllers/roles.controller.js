const rolesService = require("../services/roles.service");
const ApiError = require("@pink/shared").ApiError;

function requireTenantContext(req) {
  // Home is a roll-up, not a tenant: on Home there are no roles to manage at
  // all (previously the platform tenant's own rows leaked in here).
  if (req.auth?.isSuperAdmin && !req.auth?.actingAsTenantId) {
    throw new ApiError(400, "Select a tenant first — roles are managed per tenant");
  }
}

async function createRole(req, res, next) {
  try {
    requireTenantContext(req);
    const role = await rolesService.createRole(req.tenantId, req.body, req.auth);
    res.status(201).json(role);
  } catch (error) {
    next(error);
  }
}

async function listRoles(req, res, next) {
  try {
    if (req.auth?.isSuperAdmin && !req.auth?.actingAsTenantId) {
      res.status(200).json([]);
      return;
    }
    const roles = await rolesService.listRoles(req.tenantId);
    res.status(200).json(roles);
  } catch (error) {
    next(error);
  }
}

async function updateRole(req, res, next) {
  try {
    requireTenantContext(req);
    const role = await rolesService.updateRole(req.tenantId, req.params.roleId, req.body, req.auth);
    res.status(200).json(role);
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    requireTenantContext(req);
    await rolesService.deleteRole(req.tenantId, req.params.roleId, req.auth);
    return res.sendStatus(204);
  } catch (error) {
    return next(error);
  }
}

async function bulkDeleteRoles(req, res, next) {
  try {
    requireTenantContext(req);
    const result = await rolesService.bulkDeleteRoles(req.tenantId, req.body.roleIds, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function recomputeOrgChart(req, res, next) {
  try {
    const summary = await rolesService.recomputeOrgChart(req.tenantId, req.auth);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRole,
  listRoles,
  updateRole,
  deleteRole,
  bulkDeleteRoles,
  recomputeOrgChart,
};
