const tenantsService = require("./tenants.service");

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
    const tenants = await tenantsService.listTenants(req.auth.tenantId);
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

async function sendTenantCredentials(req, res, next) {
  try {
    const result = await tenantsService.sendTenantCredentials(req.params.tenantId, req.auth);
    res.status(200).json(result);
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

module.exports = {
  createTenant,
  listTenants,
  getCurrentTenant,
  updateTenant,
  sendTenantCredentials,
  deleteTenant,
};
