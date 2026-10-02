const express = require("express");
const controller = require("./auth.controller");
const {
  validate,
  inviteSchema,
  resendInviteSchema,
} = require("./auth.validator");

const router = express.Router();

router.get("/me", controller.me);
router.post("/invite", validate(inviteSchema), controller.inviteUser);
router.post("/resend-invite", validate(resendInviteSchema), controller.resendInvite);

module.exports = router;
