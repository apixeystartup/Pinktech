const express = require("express");
const controller = require("../controllers/tenants.controller");
const permissionMiddleware = require("../middlewares/permission.middleware");
const { validate, createTenantSchema, updateTenantSchema, assignAccountSchema } = require("../validators/tenants.validator");

const router = express.Router();

router.get("/current", controller.getCurrentTenant);
router.get("/employee-summary", controller.employeeSummary);
router.get("/", controller.listTenants);
router.post("/", validate(createTenantSchema), controller.createTenant);
router.patch(
  "/:tenantId",
  validate(updateTenantSchema),
  controller.updateTenant
);
router.delete("/:tenantId", controller.deleteTenant);
router.post(
  "/:tenantId/assign-account",
  permissionMiddleware("tenant.manage"),
  validate(assignAccountSchema),
  controller.assignAccount
);
router.post("/:tenantId/send-creds", controller.sendCreds);
router.post("/:tenantId/reset-creds", controller.resetCreds);

module.exports = router;
