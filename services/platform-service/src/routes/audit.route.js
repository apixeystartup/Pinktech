const express = require("express");
const mongoose = require("mongoose");
const AuditLog = require("../models/auditLog.model");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");
const { isPlatformTenant } = require("@pink/shared");

const router = express.Router();

const MAX_LIMIT = 100;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

/**
 * Employees see their own activity plus everything logged by the people under
 * them. Walk the reporting graph so this works for any depth, not just direct
 * reports.
 */
async function collectTeamUserIds(tenantId, rootUserId) {
  const users = await User.find({ tenantId }).select("_id reportingToUserId").lean();
  const reportsByManager = new Map();
  for (const user of users) {
    const manager = user.reportingToUserId ? String(user.reportingToUserId) : null;
    if (!manager) continue;
    if (!reportsByManager.has(manager)) reportsByManager.set(manager, []);
    reportsByManager.get(manager).push(String(user._id));
  }

  const scope = new Set([String(rootUserId)]);
  const queue = [String(rootUserId)];
  while (queue.length) {
    const current = queue.shift();
    for (const report of reportsByManager.get(current) || []) {
      if (scope.has(report)) continue;
      scope.add(report);
      queue.push(report);
    }
  }
  return [...scope];
}

function roleLabel(accountRole, isSuperAdmin) {
  if (isSuperAdmin || accountRole === "super_admin") return "super_admin";
  if (accountRole === "tenant_admin") return "tenant_admin";
  return "employee";
}

async function buildFilter(req, role, tenantId) {
  const filter = {};

  if (role === "super_admin") {
    // The platform owner audits every tenant, including the platform tenant.
  } else if (role === "tenant_admin") {
    filter.tenantId = tenantId;
  } else {
    const teamIds = await collectTeamUserIds(tenantId, req.auth.userId).catch(() => [req.auth.userId]);
    filter.$or = [
      { tenantId, userId: { $in: teamIds.map(toObjectId).filter(Boolean) } },
      // Logs that targeted this employee without an actor record.
      { tenantId, "metadata.userId": req.auth.userId },
    ];
  }

  const status = String(req.query.status || "").toUpperCase();
  if (status === "SUCCESS" || status === "ERROR") {
    filter.status = status;
  }

  const action = String(req.query.action || "").trim();
  if (action) {
    filter.action = { $regex: `^${escapeRegex(action)}`, $options: "i" };
  }

  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from && !Number.isNaN(from.getTime())) filter.createdAt = { $gte: from };
  if (to && !Number.isNaN(to.getTime())) {
    filter.createdAt = { ...(filter.createdAt || {}), $lte: to };
  }

  const q = String(req.query.q || "").trim();
  if (q) {
    const re = { $regex: escapeRegex(q), $options: "i" };
    const tenantScope = role === "super_admin" ? {} : { tenantId };
    const matchingUsers = await User.find({
      ...tenantScope,
      $or: [{ name: re }, { email: re }, { empCode: re }],
    })
      .select("_id")
      .limit(250)
      .lean();
    const matchingTenants = await Tenant.find({
      $or: [{ name: re }, { code: re }],
    })
      .select("_id")
      .limit(100)
      .lean();

    const searchClauses = [
      { action: re },
      { errorMessage: re },
      { "metadata.email": re },
      { "metadata.code": re },
      { "metadata.name": re },
      { userId: { $in: matchingUsers.map((u) => u._id) } },
      { tenantId: { $in: matchingTenants.map((t) => t._id) } },
    ];

    if (filter.$or) {
      const existing = filter.$or;
      delete filter.$or;
      filter.$and = [{ $or: existing }, { $or: searchClauses }];
    } else {
      filter.$or = searchClauses;
    }
  }

  return filter;
}

router.get("/logs", async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), MAX_LIMIT));
    const skip = (page - 1) * limit;

    const role = roleLabel(req.auth?.accountRole, req.auth?.isSuperAdmin);
    const tenantId = toObjectId(req.tenantId);
    const filter = await buildFilter(req, role, tenantId);

    const errorFilter = { ...filter, status: "ERROR" };
    delete errorFilter.$and;

    const [items, total, errorCount] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.countDocuments(errorFilter),
    ]);

    const userIds = [
      ...new Set(
        items
          .flatMap((item) => [item.userId, item.metadata?.userId, item.metadata?.targetUserId])
          .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
          .map(String),
      ),
    ];
    const tenantIds = [
      ...new Set(
        items
          .flatMap((item) => [item.tenantId, item.metadata?.tenantId])
          .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
          .map(String),
      ),
    ];

    const [users, tenants] = await Promise.all([
      userIds.length
        ? User.find({ _id: { $in: userIds.map(toObjectId) } })
            .select("name email empCode tenantId")
            .lean()
        : [],
      tenantIds.length
        ? Tenant.find({ _id: { $in: tenantIds.map(toObjectId) } })
            .select("name code")
            .lean()
        : [],
    ]);

    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const tenantMap = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

    const enriched = items.map((item) => {
      const user = item.userId ? userMap.get(String(item.userId)) : null;
      const tenant =
        (item.tenantId && tenantMap.get(String(item.tenantId))) ||
        (item.metadata?.tenantId && tenantMap.get(String(item.metadata.tenantId))) ||
        null;
      const tenantOrgLabel = tenant
        ? `${tenant.name}${isPlatformTenant(tenant) ? " · Platform" : ""}`
        : item.metadata?.code || item.metadata?.name || "Platform";
      return {
        ...item,
        status: item.status || "SUCCESS",
        errorMessage: item.errorMessage || null,
        tenantOrgLabel,
        user: user
          ? {
              name: user.name || "—",
              empCode: user.empCode || null,
              email: user.email || null,
            }
          : null,
      };
    });

    res.status(200).json({
      items: enriched,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      errorCount,
      role,
      scope:
        role === "super_admin"
          ? "All users across every tenant, including the super admin."
          : role === "tenant_admin"
            ? "Everyone in this tenant, including you."
            : "You and the people reporting to you.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
