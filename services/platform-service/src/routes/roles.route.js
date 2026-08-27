const express = require("express");
const controller = require("../controllers/roles.controller");
const { validate, createRoleSchema, updateRoleSchema, bulkDeleteRolesSchema } = require("../validators/roles.validator");

const router = express.Router();

router.post(
  "/recompute-org",
  controller.recomputeOrgChart
);
router.get("/", controller.listRoles);
router.post("/", validate(createRoleSchema), controller.createRole);
router.patch(
  "/:roleId",
  validate(updateRoleSchema),
  controller.updateRole
);
router.delete(
  "/:roleId",
  controller.deleteRole
);
router.delete(
  "/",
  validate(bulkDeleteRolesSchema),
  controller.bulkDeleteRoles
);

module.exports = router;
