const mongoose = require("mongoose");

/** Same set People/messages use: invitees count, only disabled/locked are out. */
const NOTIFIABLE_USER_FILTER = { status: { $nin: ["DISABLED", "LOCKED"] } };

function oid(id) {
  return mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null;
}

/**
 * Tenant users holding the `tenant.manage` permission — the tenant's admins.
 *
 * forms-service does not register its own Role/Permission/User models (those
 * live in the auth service), so this reads the shared collections directly.
 */
async function getTenantAdminUserIds(tenantId) {
  const db = mongoose.connection?.db;
  if (!db) return new Set();
  const tid = oid(tenantId);
  if (!tid) return new Set();

  const perm = await db.collection("permissions").findOne({ code: "tenant.manage" });
  if (!perm?._id) return new Set();

  const roles = await db
    .collection("roles")
    .find({ tenantId: tid, permissionIds: { $in: [perm._id] } })
    .project({ _id: 1 })
    .toArray();
  const roleIds = roles.map((r) => r._id);
  if (!roleIds.length) return new Set();

  const users = await db
    .collection("users")
    .find({ tenantId: tid, roleIds: { $in: roleIds }, ...NOTIFIABLE_USER_FILTER })
    .project({ _id: 1 })
    .toArray();
  return new Set(users.map((u) => String(u._id)));
}

/**
 * Pinktech's super admins: PLATFORM-tenant users holding a SYSTEM role.
 * They are notified inside the platform tenant's inbox, so a submission from
 * any tenant reaches the one shared super admin account.
 */
async function getPlatformSuperAdmins() {
  const db = mongoose.connection?.db;
  if (!db) return { tenantId: null, userIds: [] };

  const platformTenant = await db.collection("tenants").findOne({ code: "PINKTECH" });
  if (!platformTenant?._id) return { tenantId: null, userIds: [] };

  const roles = await db
    .collection("roles")
    .find({ tenantId: platformTenant._id, type: "SYSTEM" })
    .project({ _id: 1 })
    .toArray();
  const roleIds = roles.map((r) => r._id);
  if (!roleIds.length) return { tenantId: null, userIds: [] };

  const users = await db
    .collection("users")
    .find({ tenantId: platformTenant._id, roleIds: { $in: roleIds }, ...NOTIFIABLE_USER_FILTER })
    .project({ _id: 1 })
    .toArray();
  return { tenantId: String(platformTenant._id), userIds: users.map((u) => String(u._id)) };
}

module.exports = { getTenantAdminUserIds, getPlatformSuperAdmins };
