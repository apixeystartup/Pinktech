const express = require("express");
const controller = require("./auth.controller");
const {
  validate,
  loginSchema,
  verifyOtpSchema,
  setPasswordSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("./auth.validator");

const router = express.Router();

router.post("/login", validate(loginSchema), controller.login);
router.post("/refresh", validate(refreshSchema), controller.refresh);
router.post("/verify-otp", validate(verifyOtpSchema), controller.verifyOtp);
router.post("/set-password", validate(setPasswordSchema), controller.setPassword);
router.post("/forgot-password", validate(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), controller.resetPassword);

module.exports = router;
