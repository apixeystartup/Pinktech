const Joi = require("joi");
const ApiError = require("@pink/shared").ApiError;

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
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
  email: Joi.string().email().required(),
  plan: Joi.string().default("starter"),
  status: Joi.string().valid("ACTIVE", "SUSPENDED").default("ACTIVE"),
  isDemo: Joi.boolean().default(false),
  formLimitPerLogin: Joi.number().integer().min(0).default(0),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2),
  email: Joi.string().email().allow("").optional(),
  plan: Joi.string(),
  status: Joi.string().valid("ACTIVE", "SUSPENDED"),
}).min(1);

module.exports = {
  validate,
  createTenantSchema,
  updateTenantSchema,
};
