const ApiError = require("./ApiError");
const logger = require("./logger");
const permissions = require("./constants/permissions");
const platform = require("./constants/platform");
const { connectMongo } = require("./db/mongoose");
const errorMiddleware = require("./middlewares/error");
const sanitizeMiddleware = require("./middlewares/sanitize");
const requestLogger = require("./middlewares/requestLogger");
const upload = require("./middlewares/upload");
const notificationAdapter = require("./mailer");
const placeholders = require("./placeholders");
const partyExtract = require("./partyExtract");

module.exports = {
  ApiError,
  logger,
  permissions,
  platform,
  ...platform,
  connectMongo,
  errorMiddleware,
  sanitizeMiddleware,
  requestLogger,
  upload,
  notificationAdapter,
  ...placeholders,
  ...partyExtract,
};
