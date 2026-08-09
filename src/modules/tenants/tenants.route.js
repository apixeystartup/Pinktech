const express = require("express");
const controller = require("./tenants.controller");
const { validate, createTenantSchema, updateTenantSchema } = require("./tenants.validator");
const authMiddleware = require("../../middlewares/auth.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");

const router = express.Router();

router.get("/current", authMiddleware, controller.getCurrentTenant);
router.get("/", authMiddleware, permissionMiddleware("tenant.manage"), controller.listTenants);
router.post("/", authMiddleware, permissionMiddleware("tenant.manage"), validate(createTenantSchema), controller.createTenant);
router.patch(
  "/:tenantId",
  authMiddleware,
  permissionMiddleware("tenant.manage"),
  validate(updateTenantSchema),
  controller.updateTenant
);
router.post(
  "/:tenantId/send-credentials",
  authMiddleware,
  permissionMiddleware("tenant.send-credentials"),
  controller.sendTenantCredentials
);
router.delete("/:tenantId", authMiddleware, permissionMiddleware("tenant.manage"), controller.deleteTenant);

module.exports = router;
