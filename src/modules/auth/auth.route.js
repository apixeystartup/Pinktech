const express = require("express");
const controller = require("./auth.controller");
const {
  validate,
  loginSchema,
  inviteSchema,
  verifyOtpSchema,
  setPasswordSchema,
  refreshSchema,
  resendInviteSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("./auth.validator");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", validate(loginSchema), controller.login);
router.get("/me", authMiddleware, controller.me);
router.post("/refresh", validate(refreshSchema), controller.refresh);
router.post("/verify-otp", validate(verifyOtpSchema), controller.verifyOtp);
router.post("/set-password", validate(setPasswordSchema), controller.setPassword);
router.post("/invite", validate(inviteSchema), controller.inviteUser);
router.post("/resend-invite", validate(resendInviteSchema), controller.resendInvite);
router.post("/forgot-password", validate(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), controller.resetPassword);

module.exports = router;
