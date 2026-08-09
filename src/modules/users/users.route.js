const express = require("express");
const authController = require("../auth/auth.controller");
const usersController = require("./users.controller");
const { validate: validateAuth, inviteSchema } = require("../auth/auth.validator");
const { validate: validateUsers, patchUserSchema, bulkAssignSchema } = require("./users.validator");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");

const router = express.Router();

router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware("user.view"), usersController.listUsers);
router.post(
  "/send-credentials-bulk",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.send-credentials"),
  usersController.sendEmployeeCredentialsBulk
);
router.post(
  "/bulk-assign-reporting",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.update"),
  validateUsers(bulkAssignSchema),
  usersController.bulkAssignReporting
);
router.post(
  "/invite",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.invite"),
  validateAuth(inviteSchema),
  authController.inviteUser
);
router.patch(
  "/:userId",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.update"),
  validateUsers(patchUserSchema),
  usersController.updateUser
);
router.delete(
  "/:userId",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("tenant.manage"),
  usersController.deleteUser
);
router.get(
  "/:userId/subtree",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.view"),
  usersController.getUserSubtree
);
router.post(
  "/:userId/send-credentials",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("user.send-credentials"),
  usersController.sendEmployeeCredentials
);

module.exports = router;
