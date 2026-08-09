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

const patchUserSchema = Joi.object({
  name: Joi.string().min(2),
  empCode: Joi.string().trim().max(64).allow(null, ""),
  roleIds: Joi.array().items(Joi.string()),
  currentPositionId: Joi.string().allow(null, ""),
  reportingToUserId: Joi.string().allow(null, ""),
  designationOverride: Joi.string().trim().max(200).allow(null, ""),
  zone: Joi.string().trim().max(120).allow(null, ""),
  region: Joi.string().trim().max(120).allow(null, ""),
  state: Joi.string().trim().max(120).allow(null, ""),
  hq: Joi.string().trim().max(120).allow(null, ""),
}).min(1);

const bulkAssignSchema = Joi.object({
  userIds: Joi.array().items(Joi.string()).min(1).required(),
  reportingToUserId: Joi.string().allow(null).required(),
});

module.exports = {
  validate,
  patchUserSchema,
  bulkAssignSchema,
};
