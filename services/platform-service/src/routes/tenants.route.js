const express = require("express");
const controller = require("../controllers/tenants.controller");
const permissionMiddleware = require("../middlewares/permission.middleware");
const { validate, createTenantSchema, updateTenantSchema, updateOwnTenantSchema, assignAccountSchema, unassignAccountSchema } = require("../validators/tenants.validator");

const router = express.Router();

router.get("/current", controller.getCurrentTenant);
// Tenant admins maintain their own org profile here (templates Party 1).
// Registered before "/:tenantId" so "current" is never treated as an id.
router.patch("/current", validate(updateOwnTenantSchema), controller.updateCurrentTenant);
router.get("/employee-summary", controller.employeeSummary);
router.get("/", controller.listTenants);
router.post("/", validate(createTenantSchema), controller.createTenant);
router.patch(
  "/:tenantId",
  validate(updateTenantSchema),
  controller.updateTenant
);
router.post("/:tenantId/admin/unlock", controller.unlockTenantAdmin);
router.delete("/:tenantId", controller.deleteTenant);
router.post(
  "/:tenantId/assign-account",
  permissionMiddleware("tenant.manage"),
  validate(assignAccountSchema),
  controller.assignAccount
);
router.post(
  "/:tenantId/unassign-account",
  permissionMiddleware("tenant.manage"),
  validate(unassignAccountSchema),
  controller.unassignAccount
);
router.post("/:tenantId/send-creds", controller.sendCreds);
router.post("/:tenantId/reset-creds", controller.resetCreds);

module.exports = router;
