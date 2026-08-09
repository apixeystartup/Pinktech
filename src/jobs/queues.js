const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const env = require("../config/env");

let queuesInitialized = false;
let connection = null;
let notificationQueue = null;
let importQueue = null;
let documentQueue = null;

function initQueues() {
  if (queuesInitialized) {
    return { connection, notificationQueue, importQueue, documentQueue };
  }

  connection = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null,
  });

  notificationQueue = new Queue("notifications", { connection });
  importQueue = new Queue("imports", { connection });
  documentQueue = new Queue("documents", { connection });
  queuesInitialized = true;

  return { connection, notificationQueue, importQueue, documentQueue };
}

module.exports = {
  initQueues,
};
