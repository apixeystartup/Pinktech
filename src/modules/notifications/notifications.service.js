const mongoose = require("mongoose");
const Position = require("../../models/position.model");
const Assignment = require("../../models/assignment.model");
const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const Permission = require("../../models/permission.model");

/** Positions at depth 0..N (from org roots) count as "high level" for employee messaging. */
const HIGH_LEVEL_MAX_DEPTH = Number(process.env.NOTIFICATION_HIGH_LEVEL_MAX_DEPTH || 1);

/** Same idea as People list: include invited/onboarding users, exclude only disabled/locked. */
const NOTIFIABLE_USER_FILTER = { status: { $nin: ["DISABLED", "LOCKED"] } };

function positionDepthMap(positions) {
  const idSet = new Set(positions.map((p) => String(p._id)));
  const childrenByParent = new Map();
  for (const p of positions) {
    const parentOk = p.parentPositionId && idSet.has(String(p.parentPositionId));
    const parentKey = parentOk ? String(p.parentPositionId) : "ROOT";
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(String(p._id));
  }
  const depth = new Map();
  const queue = (childrenByParent.get("ROOT") || []).map((id) => ({ id, d: 0 }));
  while (queue.length) {
    const { id, d } = queue.shift();
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const child of childrenByParent.get(id) || []) {
      queue.push({ id: child, d: d + 1 });
    }
  }
  return depth;
}

async function getUserIdsWithTenantManage(tenantId) {
  const perm = await Permission.findOne({ code: "tenant.manage" }).lean();
  if (!perm) return new Set();
  const roles = await Role.find({ tenantId, permissionIds: { $in: [perm._id] } })
    .select("_id")
    .lean();
  const roleIds = roles.map((r) => r._id);
  if (!roleIds.length) return new Set();
  const users = await User.find({ tenantId, roleIds: { $in: roleIds }, ...NOTIFIABLE_USER_FILTER })
    .select("_id")
    .lean();
  return new Set(users.map((u) => String(u._id)));
}

async function getUserIdsAtHighLevels(tenantId, depthMap) {
  const highPositionIds = [];
  for (const [pid, d] of depthMap) {
    if (d <= HIGH_LEVEL_MAX_DEPTH) highPositionIds.push(new mongoose.Types.ObjectId(pid));
  }
  if (!highPositionIds.length) return new Set();
  const assignments = await Assignment.find({
    tenantId,
    isCurrent: true,
    positionId: { $in: highPositionIds },
  })
    .select("userId")
    .lean();
  return new Set(assignments.map((a) => String(a.userId)));
}

async function getElevatedRecipientIdSet(tenantId) {
  const positions = await Position.find({ tenantId, status: "ACTIVE" }).lean();
  const depthMap = positionDepthMap(positions);
  const admins = await getUserIdsWithTenantManage(tenantId);
  const highLevel = await getUserIdsAtHighLevels(tenantId, depthMap);
  return new Set([...admins, ...highLevel]);
}

async function listEligibleRecipients(tenantId) {
  const ids = await getElevatedRecipientIdSet(tenantId);
  const oid = [...ids].filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  if (!oid.length) return [];
  const users = await User.find({ _id: { $in: oid }, tenantId, ...NOTIFIABLE_USER_FILTER })
    .select("name email status")
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({ _id: u._id, name: u.name, email: u.email, status: u.status }));
}

async function listAllActiveUsers(tenantId) {
  return User.find({ tenantId, ...NOTIFIABLE_USER_FILTER })
    .select("name email status")
    .sort({ name: 1 })
    .lean();
}

async function assertRecipientsInTenant(tenantId, recipientIds) {
  const count = await User.countDocuments({
    tenantId,
    ...NOTIFIABLE_USER_FILTER,
    _id: { $in: recipientIds },
  });
  if (count !== recipientIds.length) {
    return false;
  }
  return true;
}

module.exports = {
  getUserIdsWithTenantManage,
  getElevatedRecipientIdSet,
  listEligibleRecipients,
  listAllActiveUsers,
  assertRecipientsInTenant,
  HIGH_LEVEL_MAX_DEPTH,
};
