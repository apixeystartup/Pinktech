const dotenv = require("dotenv");
const Joi = require("joi");

const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().default(5001),
  MONGO_URI: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
}).unknown();

const { error, value } = schema.validate(process.env);

if (error) {
  throw new Error(`Gateway env validation failed: ${error.message}`);
}

module.exports = value;
