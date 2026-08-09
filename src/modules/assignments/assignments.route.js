const express = require("express");
const controller = require("./assignments.controller");
const { validate, assignSeatSchema } = require("./assignments.validator");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const hierarchyMiddleware = require("../../middlewares/hierarchy.middleware");

const router = express.Router();

router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware("employee.view"), controller.listAssignments);
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("position.assign"),
  hierarchyMiddleware(),
  validate(assignSeatSchema),
  controller.assignSeat
);

module.exports = router;
