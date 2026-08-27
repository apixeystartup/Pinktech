const express = require("express");
const Joi = require("joi");
const controller = require("../services/positions.controller");
const permissionMiddleware = require("../middlewares/permission.middleware");
const hierarchyMiddleware = require("../middlewares/hierarchy.middleware");
const ApiError = require("@pink/shared").ApiError;

const router = express.Router();

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return next(new ApiError(422, "Validation failed", error.details));
    }
    req.body = value;
    return next();
  };
}

const createPositionSchema = Joi.object({
  roleId: Joi.string().required(),
  levelName: Joi.string().min(1).required(),
  parentPositionId: Joi.string().allow(null).default(null),
});

const updatePositionSchema = Joi.object({
  roleId: Joi.string(),
  levelName: Joi.string().min(1),
  parentPositionId: Joi.string().allow(null),
  status: Joi.string().valid("ACTIVE", "INACTIVE"),
}).min(1);

const deletePositionsSchema = Joi.object({
  positionIds: Joi.array().items(Joi.string()).min(1).required(),
});

router.get("/", permissionMiddleware("employee.view"), controller.listPositions);
router.post(
  "/",
  permissionMiddleware("position.create"),
  validate(createPositionSchema),
  controller.createPosition
);
router.patch(
  "/:positionId",
  permissionMiddleware("position.update"),
  hierarchyMiddleware(),
  validate(updatePositionSchema),
  controller.updatePosition
);
router.get(
  "/:positionId/subtree",
  permissionMiddleware("employee.view"),
  hierarchyMiddleware(),
  controller.getSubtree
);
router.delete(
  "/",
  permissionMiddleware("position.update"),
  validate(deletePositionsSchema),
  controller.deletePositions
);

module.exports = router;
