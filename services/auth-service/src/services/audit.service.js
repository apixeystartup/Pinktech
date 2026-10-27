const AuditLog = require("../models/auditLog.model");
const { getRequestDurationMs } = require("@pink/shared");

async function writeAudit({
  tenantId = null,
  userId = null,
  action,
  status = "SUCCESS",
  errorMessage = null,
  metadata = {},
}) {
  try {
    await AuditLog.create({
      tenantId,
      userId,
      action,
      status,
      errorMessage,
      metadata,
      durationMs: getRequestDurationMs(),
    });
  } catch (error) {
    // Auditing must never break the action it is recording.
    const { logger } = require("@pink/shared");
    logger.error({ error, action }, "Failed to write audit log");
  }
}

module.exports = {
  writeAudit,
};
