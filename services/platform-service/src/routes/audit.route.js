const express = require("express");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

router.get("/logs", async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;
    const permissionCodes = req.auth?.permissionCodes || [];
    const isSuperAdmin = (permissionCodes.includes("*") || permissionCodes.includes("tenant.manage")) && !req.tenantId;
    const isTenantAdmin = (permissionCodes.includes("*") || permissionCodes.includes("tenant.manage")) && req.tenantId;

    let filter = {};
    if (isSuperAdmin) {
      filter = {};
    } else if (isTenantAdmin) {
      filter = { tenantId: req.tenantId };
    } else {
      filter = { tenantId: req.tenantId, userId: req.auth.userId };
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    res.status(200).json({
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
