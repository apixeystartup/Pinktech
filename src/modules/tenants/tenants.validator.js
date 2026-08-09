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

const createTenantSchema = Joi.object({
  name: Joi.string().min(2).required(),
  code: Joi.string().alphanum().min(2).max(20).required(),
  adminEmail: Joi.string().email({ tlds: { allow: false } }).required(),
  plan: Joi.string().default("starter"),
  status: Joi.string().valid("ACTIVE", "SUSPENDED").default("ACTIVE"),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2).allow("", null),
  adminEmail: Joi.string().email({ tlds: { allow: false } }).allow("", null),
  plan: Joi.string().allow("", null),
  status: Joi.string().valid("ACTIVE", "SUSPENDED"),
}).min(1);

module.exports = {
  validate,
  createTenantSchema,
  updateTenantSchema,
};
