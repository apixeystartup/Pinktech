const rolesService = require("./roles.service");

async function createRole(req, res, next) {
  try {
    const role = await rolesService.createRole(req.tenantId, req.body, req.auth);
    res.status(201).json(role);
  } catch (error) {
    next(error);
  }
}

async function listRoles(req, res, next) {
  try {
    const roles = await rolesService.listRoles(req.tenantId);
    res.status(200).json(roles);
  } catch (error) {
    next(error);
  }
}

async function updateRole(req, res, next) {
  try {
    const role = await rolesService.updateRole(req.tenantId, req.params.roleId, req.body, req.auth);
    res.status(200).json(role);
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    await rolesService.deleteRole(req.tenantId, req.params.roleId, req.auth);
    return res.sendStatus(204);
  } catch (error) {
    return next(error);
  }
}

async function bulkDeleteRoles(req, res, next) {
  try {
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
