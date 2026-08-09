const Joi = require("joi");
const ApiError = require("../../common/errors/ApiError");

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

module.exports = {
  validate,
  createPositionSchema,
  updatePositionSchema,
  deletePositionsSchema,
};
