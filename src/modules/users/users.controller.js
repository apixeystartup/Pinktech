const usersService = require("./users.service");

async function listUsers(req, res, next) {
  try {
    const roleId = req.query.roleId ? String(req.query.roleId).trim() : "";
    const users = await usersService.listUsers(req.tenantId, { roleId });
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await usersService.updateUser(req.tenantId, req.params.userId, req.body, req.auth);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    await usersService.deleteUser(req.tenantId, req.params.userId, req.auth);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
}

async function bulkAssignReporting(req, res, next) {
  try {
    const result = await usersService.bulkAssignReporting(req.tenantId, req.body, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getUserSubtree(req, res, next) {
  try {
    const data = await usersService.getUserSubtree(req.tenantId, req.params.userId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

async function sendEmployeeCredentials(req, res, next) {
  try {
    const result = await usersService.sendEmployeeCredentials(req.tenantId, req.params.userId, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function sendEmployeeCredentialsBulk(req, res, next) {
  try {
    const { userIds } = req.body;
    const result = await usersService.sendEmployeeCredentialsBulk(req.tenantId, userIds, req.auth);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  updateUser,
  deleteUser,
  bulkAssignReporting,
  getUserSubtree,
  sendEmployeeCredentials,
  sendEmployeeCredentialsBulk,
};
