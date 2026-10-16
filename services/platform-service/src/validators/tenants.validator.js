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
  // tlds:{allow:false} keeps dev/test addresses like ops@acme.test valid;
  // trim() strips stray whitespace before the email check.
  email: Joi.string().trim().email({ tlds: { allow: false } }).allow("").optional(),
  address: Joi.string().max(500).allow("", null).optional(),
  phone: Joi.string().max(30).allow("", null).optional(),
  registrationNumber: Joi.string().max(100).allow("", null).optional(),
  // Base64 data URL of the drawn/uploaded Party 1 signature. Capped at
  // ~1.2M chars so the request stays under the gateway's 2mb JSON limit.
  signature: Joi.string()
    .max(1200000)
    .pattern(/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/)
    .allow("", null)
    .optional(),
  // Party 1 stamp/seal image — same data-URL contract as the signature.
  stamp: Joi.string()
    .max(1200000)
    .pattern(/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/)
    .allow("", null)
    .optional(),
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
