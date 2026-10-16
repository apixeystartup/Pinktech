const dotenv = require("dotenv");
const Joi = require("joi");

const path = require("path");
dotenv.config({
  path: path.join(__dirname, "../../../../.env"),
  quiet: process.env.NODE_ENV === "test",
});

const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  // 4009: next free port after notifications (4008).
  PORT: Joi.number().default(4009),
  MONGO_URI: Joi.string().required(),
  // Used to derive the ceremony-token encryption key (see services/ceremonyToken.js).
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  // Public bases used to build the signing links handed to recipients.
  APP_PUBLIC_URL: Joi.string().allow("").default(""),
  DEV_APP_PUBLIC_URL: Joi.string().allow("").default("http://127.0.0.1:5173"),
}).unknown();

const { error, value } = schema.validate(process.env);

if (error) {
  throw new Error(`Environment validation failed: ${error.message}`);
}

module.exports = value;
