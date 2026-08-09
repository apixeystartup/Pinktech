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

const assignSeatSchema = Joi.object({
  userId: Joi.string().required(),
  positionId: Joi.string().required(),
  activeFrom: Joi.date().optional(),
});

module.exports = {
  validate,
  assignSeatSchema,
};
