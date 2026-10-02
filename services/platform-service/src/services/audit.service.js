const AuditLog = require("../models/auditLog.model");

async function writeAudit({ tenantId = null, userId = null, action, metadata = {} }) {
  await AuditLog.create({
    tenantId,
    userId,
    action,
    metadata,
  });
}

module.exports = {
  writeAudit,
};
