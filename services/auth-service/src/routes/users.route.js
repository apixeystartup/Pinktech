const express = require("express");
const authController = require("./auth.controller");
const usersController = require("./users.controller");
const { validate: validateAuth, inviteSchema } = require("./auth.validator");
const { validate: validateUsers, patchUserSchema, bulkAssignSchema } = require("./users.validator");

const router = express.Router();

router.get("/", usersController.listUsers);
router.patch(
  "/:userId",
  validateUsers(patchUserSchema),
  usersController.updateUser
);
router.delete(
  "/:userId",
  usersController.deleteUser
);
router.post(
  "/bulk-assign-reporting",
  validateUsers(bulkAssignSchema),
  usersController.bulkAssignReporting
);
router.get(
  "/:userId/subtree",
  usersController.getUserSubtree
);
router.post(
  "/invite",
  validateAuth(inviteSchema),
  authController.inviteUser
);
router.post(
  "/:userId/send-creds",
  usersController.sendCredentials
);
router.post(
  "/:userId/reset-creds",
  usersController.resetCredentials
);

module.exports = router;
