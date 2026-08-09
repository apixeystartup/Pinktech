const morgan = require("morgan");
const logger = require("../common/logger");

const stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = morgan("combined", { stream });
