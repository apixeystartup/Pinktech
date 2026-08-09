const logger = require("../common/logger");

function errorMiddleware(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const payload = {
    message: err.message || "Internal server error",
    details: err.details || null,
  };

  if (statusCode >= 500) {
    logger.error({ err, path: req.path }, "Unhandled error");
  }

  res.status(statusCode).json(payload);
}

module.exports = errorMiddleware;
