const Joi = require("joi");
const ApiError = require("../../common/errors/ApiError");
const { ORG_SCOPES } = require("../../models/role.model");

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

const createRoleSchema = Joi.object({
  name: Joi.string().min(2).required(),
  permissionIds: Joi.array().items(Joi.string()).default([]),
  permissionCodes: Joi.array().items(Joi.string()).default([]),
  type: Joi.string().valid("SYSTEM", "CUSTOM").default("CUSTOM"),
}).custom((value, helpers) => {
  const n = (value.permissionIds?.length || 0) + (value.permissionCodes?.length || 0);
  if (n < 1) {
    return helpers.error("any.invalid", { message: "Select at least one permission" });
  }
  return value;
});

const updateRoleSchema = Joi.object({
  name: Joi.string().min(2),
  permissionIds: Joi.array().items(Joi.string()),
  permissionCodes: Joi.array().items(Joi.string()),
  aliases: Joi.array().items(Joi.string()),
  orgLevelOverride: Joi.number().integer().min(1).allow(null),
  orgScopeOverride: Joi.string()
    .valid(...ORG_SCOPES)
    .allow(null),
})
  .min(1)
  .custom((value, helpers) => {
    const touchingPerms = value.permissionIds !== undefined || value.permissionCodes !== undefined;
    if (!touchingPerms) {
      return value;
    }
    const n = (value.permissionIds?.length || 0) + (value.permissionCodes?.length || 0);
    if (n < 1) {
      return helpers.error("any.invalid", { message: "When updating permissions, select at least one" });
    }
    return value;
  });

const bulkDeleteRolesSchema = Joi.object({
  roleIds: Joi.array().items(Joi.string()).min(1).required(),
});

module.exports = {
  validate,
  createRoleSchema,
  updateRoleSchema,
  bulkDeleteRolesSchema,
};
