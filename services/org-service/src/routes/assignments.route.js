const express = require("express");
const Joi = require("joi");
const controller = require("../services/assignments.controller");
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

const assignSeatSchema = Joi.object({
  userId: Joi.string().required(),
  positionId: Joi.string().required(),
  activeFrom: Joi.date().optional(),
});

router.get("/", permissionMiddleware("employee.view"), controller.listAssignments);
router.post(
  "/",
  permissionMiddleware("position.assign"),
  hierarchyMiddleware(),
  validate(assignSeatSchema),
  controller.assignSeat
);

module.exports = router;
