const express = require("express");
const controller = require("./roles.controller");
const { validate, createRoleSchema, updateRoleSchema, bulkDeleteRolesSchema } = require("./roles.validator");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");

const router = express.Router();

router.post(
  "/recompute-org",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("role.assign"),
  controller.recomputeOrgChart
);
router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware("role.view"), controller.listRoles);
router.post("/", authMiddleware, tenantMiddleware, permissionMiddleware("role.assign"), validate(createRoleSchema), controller.createRole);
router.patch(
  "/:roleId",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("role.assign"),
  validate(updateRoleSchema),
  controller.updateRole
);
router.delete(
  "/:roleId",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("role.assign"),
  controller.deleteRole
);
router.delete(
  "/",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("role.assign"),
  validate(bulkDeleteRolesSchema),
  controller.bulkDeleteRoles
);

module.exports = router;
