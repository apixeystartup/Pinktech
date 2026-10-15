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
  address: Joi.string().max(500).allow("", null).default(""),
  phone: Joi.string().max(30).allow("", null).default(""),
  registrationNumber: Joi.string().max(100).allow("", null).default(""),
  plan: Joi.string().default("starter"),
  status: Joi.string().valid("ACTIVE", "SUSPENDED").default("ACTIVE"),
  isDemo: Joi.boolean().default(false),
  formLimitPerLogin: Joi.number().integer().min(0).default(0),
  organizationStartDate: Joi.date().allow(null, "").default(null),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2),
  email: Joi.string().email().allow("").optional(),
  address: Joi.string().max(500).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  registrationNumber: Joi.string().max(100).allow("", null).optional(),
  plan: Joi.string(),
  status: Joi.string().valid("ACTIVE", "SUSPENDED"),
  organizationStartDate: Joi.date().allow(null, ""),
}).min(1);

const updateOwnTenantSchema = Joi.object({
  email: Joi.string().email().allow("").optional(),
  address: Joi.string().max(500).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  registrationNumber: Joi.string().max(100).allow("", null).optional(),
}).min(1);

const assignAccountSchema = Joi.object({
  userId: Joi.string().trim().required(),
});

const unassignAccountSchema = Joi.object({
  userId: Joi.string().trim().allow("", null).optional(),
});

module.exports = {
  validate,
  createTenantSchema,
  updateTenantSchema,
  updateOwnTenantSchema,
  assignAccountSchema,
  unassignAccountSchema,
};
