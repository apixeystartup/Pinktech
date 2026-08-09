const authService = require("./auth.service");
const ApiError = require("../../common/errors/ApiError");

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function inviteUser(req, res, next) {
  try {
    const tenantId = req.body.tenantId || req.tenantId;
    if (!tenantId) {
      return next(new ApiError(400, "tenantId required"));
    }
    const result = await authService.inviteUser({ ...req.body, tenantId });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await authService.verifyOtp(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function setPassword(req, res, next) {
  try {
    const result = await authService.setPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refresh(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function resendInvite(req, res, next) {
  try {
    const result = await authService.resendInvite(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const profile = await authService.getSessionProfile(req.auth.userId);
    res.status(200).json({
      ...profile,
      permissionCodes: req.auth.permissionCodes || [],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  inviteUser,
  verifyOtp,
  setPassword,
  refresh,
  resendInvite,
  forgotPassword,
  resetPassword,
  me,
};
