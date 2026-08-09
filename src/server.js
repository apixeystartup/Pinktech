const http = require("http");
const net = require("net");
const app = require("./app");
const env = require("./config/env");
const logger = require("./common/logger");
const { connectMongo } = require("./db/mongoose");
const { registerWorkers } = require("./jobs/workers");
const { verifySmtpConnection } = require("./modules/notifications/notification.adapter");

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();

    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port);
  });
}

async function resolveListenPort(startPort, maxRetries = 20) {
  let port = Number(startPort);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    // Reserve the first available port near configured PORT to avoid startup crashes.
    // This keeps local dev resilient when old node processes still hold a port.
    const isFree = await canListenOnPort(port);
    if (isFree) {
      return port;
    }

    logger.warn(`Port ${port} is in use, retrying on ${port + 1}.`);
    port += 1;
  }

  throw new Error(`Could not find a free port after ${maxRetries} retries from ${startPort}.`);
}

async function bootstrap() {
  await connectMongo();
  registerWorkers();
  await verifySmtpConnection();

  const server = http.createServer(app);
  const port = await resolveListenPort(env.PORT, 20);

  server.on("error", (error) => {
    logger.error({ error }, "HTTP server startup error");
    process.exit(1);
  });

  server.listen(port, () => {
    logger.info(`API listening on port ${port}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully.`);
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error) => {
  logger.error({ error }, "Boot failure");
  process.exit(1);
});
