const { AsyncLocalStorage } = require("node:async_hooks");

const requestContext = new AsyncLocalStorage();

function requestContextMiddleware(req, res, next) {
  requestContext.run({ startedAt: process.hrtime.bigint() }, next);
}

function getRequestDurationMs() {
  const startedAt = requestContext.getStore()?.startedAt;
  if (!startedAt) return null;
  return Math.max(0, Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6));
}

module.exports = {
  requestContextMiddleware,
  getRequestDurationMs,
};
