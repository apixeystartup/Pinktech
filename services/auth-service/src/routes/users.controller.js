const usersService = require("../services/users.service");

async function listUsers(req, res, next) {
  try {
    const roleId = req.query.roleId ? String(req.query.roleId).trim() : "";
    const showAll = req.query.showAll === "true" || req.query.showAll === "1";
    const users = await usersService.listUsers(req.tenantId, { roleId, showAll });
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

async function sendCredentials(req, res, next) {
  try {
    const result = await usersService.sendCredentials(req.tenantId, req.params.userId, req.auth);
    res.status(200).json({ message: "Credentials sent", email: result.email, tempPassword: result.tempPassword });
  } catch (error) {
    next(error);
  }
}

async function resetCredentials(req, res, next) {
  try {
    const result = await usersService.resetCredentials(req.tenantId, req.params.userId, req.auth);
    res.status(200).json({ message: "Credentials reset and sent", email: result.email, tempPassword: result.tempPassword });
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
  sendCredentials,
  resetCredentials,
};
