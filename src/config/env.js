const dotenv = require("dotenv");
const Joi = require("joi");

dotenv.config({
  quiet: process.env.NODE_ENV === "test",
});

const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().default(5000),
  MONGO_URI: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),
  SUPER_ADMIN_EMAIL: Joi.string().email().required(),
  SUPER_ADMIN_PASSWORD: Joi.string().min(8).required(),
  SUPER_ADMIN_NAME: Joi.string().default("Platform Super Admin"),
  REDIS_HOST: Joi.string().default("127.0.0.1"),
  REDIS_PORT: Joi.number().default(6379),
  QUEUES_ENABLED: Joi.boolean()
    .truthy("true")
    .truthy("1")
    .falsy("false")
    .falsy("0")
    .default(process.env.NODE_ENV === "production"),
  SMTP_HOST: Joi.string().allow("").default(""),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow("").default(""),
  SMTP_PASS: Joi.string().allow("").default(""),
  SMTP_FROM: Joi.string().allow("").default(""),
  EMAIL_MODE: Joi.string().valid("mock", "smtp").default(process.env.NODE_ENV === "production" ? "smtp" : "mock"),
  DEV_OTP: Joi.string().allow("").default(""),
  AWS_REGION: Joi.string().default("ap-south-1"),
  AWS_S3_BUCKET: Joi.string().allow("").default(""),
  PINK_FORM_SUBMISSIONS_PATH: Joi.string().default("/api/v1/schema-forms/submissions"),
  /** Public web app origin for links in invite emails (e.g. https://app.example.com). */
  APP_PUBLIC_URL: Joi.string().allow("").default(""),
  /** When APP_PUBLIC_URL is empty (dev), form links in email use this origin (Vite default port). */
  DEV_APP_PUBLIC_URL: Joi.string().allow("").default("http://127.0.0.1:5173"),
  /** Public API base for PDF links in emails (e.g. https://api.example.com). Defaults to localhost:PORT in dev. */
  API_PUBLIC_URL: Joi.string().allow("").default(""),
}).unknown();

const { error, value } = schema.validate(process.env);

if (error) {
  throw new Error(`Environment validation failed: ${error.message}`);
}

module.exports = value;
