const express = require("express");
const controller = require("./positions.controller");
const { validate, createPositionSchema, updatePositionSchema, deletePositionsSchema } = require("./positions.validator");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const hierarchyMiddleware = require("../../middlewares/hierarchy.middleware");

const router = express.Router();

router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware("employee.view"), controller.listPositions);
router.post(
  "/",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("position.create"),
  validate(createPositionSchema),
  controller.createPosition
);
router.patch(
  "/:positionId",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("position.update"),
  hierarchyMiddleware(),
  validate(updatePositionSchema),
  controller.updatePosition
);
router.get(
  "/:positionId/subtree",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("employee.view"),
  hierarchyMiddleware(),
  controller.getSubtree
);
router.delete(
  "/",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("position.update"),
  validate(deletePositionsSchema),
  controller.deletePositions
);

module.exports = router;
