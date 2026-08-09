const { Worker } = require("bullmq");
const logger = require("../common/logger");
const env = require("../config/env");
const { initQueues } = require("./queues");

function registerWorkers() {
  if (!env.QUEUES_ENABLED) {
    logger.info("Queues are disabled for this environment");
    return;
  }

  const { connection } = initQueues();
  connection.on("error", (error) => {
    logger.warn({ error }, "Redis connection issue for queue workers");
  });

  new Worker(
    "notifications",
    async (job) => {
      logger.info({ jobId: job.id, payload: job.data }, "Notification job received");
    },
    { connection }
  );

  new Worker(
    "imports",
    async (job) => {
      logger.info({ jobId: job.id, payload: job.data }, "Import job received");
    },
    { connection }
  );

  new Worker(
    "documents",
    async (job) => {
      logger.info({ jobId: job.id, payload: job.data }, "Document job received");
    },
    { connection }
  );
}

module.exports = { registerWorkers };
