const express = require("express");
const mongoose = require("mongoose");
const AuditLog = require("../models/auditLog.model");
const AuditReadState = require("../models/auditReadState.model");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");
const Role = require("../models/role.model");
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

function auditReadScope(role, tenantId) {
  return role === "super_admin" ? "all" : String(tenantId);
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

router.post("/logs/read", async (req, res, next) => {
  try {
    const userId = toObjectId(req.auth?.userId);
    const tenantId = toObjectId(req.tenantId);
    if (!userId || !tenantId) {
      return res.status(401).json({ message: "Missing audit read context." });
    }

    const role = roleLabel(req.auth?.accountRole, req.auth?.isSuperAdmin);
    const lastReadAt = new Date();
    await AuditReadState.updateOne(
      { userId, scope: auditReadScope(role, tenantId) },
      { $max: { lastReadAt } },
      { upsert: true },
    );
    res.status(200).json({ lastReadAt });
  } catch (error) {
    next(error);
  }
});

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

    const readStatePromise = AuditReadState.findOne({
      userId: req.auth.userId,
      scope: auditReadScope(role, tenantId),
    })
      .select("lastReadAt")
      .lean();
    const [items, total, errorCount, readState] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.countDocuments(errorFilter),
      readStatePromise,
    ]);
    const unreadErrorFilter = { ...errorFilter };
    if (readState?.lastReadAt) {
      unreadErrorFilter.createdAt = {
        ...(unreadErrorFilter.createdAt || {}),
        $gt: readState.lastReadAt,
      };
    }
    const unreadErrorCount = await AuditLog.countDocuments(unreadErrorFilter);

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
            .select("name email empCode tenantId roleIds")
            .lean()
        : [],
      tenantIds.length
        ? Tenant.find({ _id: { $in: tenantIds.map(toObjectId) } })
            .select("name code adminUserId")
            .lean()
        : [],
    ]);

    const userTenantIds = [
      ...new Set(users.map((user) => String(user.tenantId)).filter((id) => !tenantIds.includes(id))),
    ];
    const roleIds = [
      ...new Set(users.flatMap((user) => (user.roleIds || []).map(String))),
    ];
    const [userTenants, roles] = await Promise.all([
      userTenantIds.length
        ? Tenant.find({ _id: { $in: userTenantIds.map(toObjectId) } })
            .select("name code adminUserId")
            .lean()
        : [],
      roleIds.length
        ? Role.find({ _id: { $in: roleIds.map(toObjectId) } })
            .select("name")
            .lean()
        : [],
    ]);

    const allTenants = [...tenants, ...userTenants];
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const tenantMap = new Map(allTenants.map((tenant) => [String(tenant._id), tenant]));
    const roleMap = new Map(roles.map((role) => [String(role._id), role.name]));

    const enriched = items.map((item) => {
      const user = item.userId ? userMap.get(String(item.userId)) : null;
      const userTenant = user?.tenantId ? tenantMap.get(String(user.tenantId)) : null;
      const tenant =
        (item.tenantId && tenantMap.get(String(item.tenantId))) ||
        (item.metadata?.tenantId && tenantMap.get(String(item.metadata.tenantId))) ||
        null;
      const roleNames = (user?.roleIds || [])
        .map((roleId) => roleMap.get(String(roleId)))
        .filter(Boolean);
      const isTenantAdmin =
        user && userTenant?.adminUserId && String(userTenant.adminUserId) === String(user._id);
      const displayLabel = !user
        ? "System"
        : isPlatformTenant(userTenant)
          ? "Platform Super Admin"
          : isTenantAdmin
            ? `${userTenant?.name || "Tenant"} - Admin`
            : `${user.name || "—"} - ${roleNames.join(", ") || "Employee"}`;
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
              roleNames,
              displayLabel,
            }
          : { name: "System", empCode: null, email: null, roleNames: [], displayLabel },
      };
    });

    res.status(200).json({
      items: enriched,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      errorCount,
      unreadErrorCount,
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
