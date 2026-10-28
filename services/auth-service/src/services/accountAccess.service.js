const Role = require("../models/role.model");
const Tenant = require("../models/tenant.model");
const ApiError = require("@pink/shared").ApiError;

function userRoleIds(user) {
  return (user?.roleIds || []).map((role) => String(role?._id || role));
}

async function isTenantAdminAccount(tenantId, user) {
  const tenant = await Tenant.findById(tenantId).select("adminUserId email").lean();
  if (
    (tenant?.adminUserId && String(tenant.adminUserId) === String(user?._id))
    || (tenant?.email && String(tenant.email).trim().toLowerCase() === String(user?.email || "").trim().toLowerCase())
  ) {
    return true;
  }

  const roleIds = userRoleIds(user);
  if (!roleIds.length) return false;
  const roles = await Role.find({ _id: { $in: roleIds }, tenantId }).select("name type").lean();
  return roles.some((role) => role.type === "SYSTEM" || /admin/i.test(role.name || ""));
}

async function assertTenantAdminCanManageAccount(actor, tenantId, user, action) {
  if (actor?.isSuperAdmin || actor?.accountRole !== "tenant_admin") return;
  const isSelf = String(actor.userId) === String(user?._id);
  if (isSelf || await isTenantAdminAccount(tenantId, user)) {
    throw new ApiError(403, `Tenant admins cannot ${action} their own or another admin account`);
  }
}

async function assertTenantAdminCanAssignRoles(tenantId, roleIds, actor) {
  if (actor?.isSuperAdmin || actor?.accountRole !== "tenant_admin" || !roleIds?.length) return;
  const roles = await Role.find({ _id: { $in: roleIds }, tenantId }).select("name type").lean();
  if (roles.some((role) => role.type === "SYSTEM" || /admin/i.test(role.name || ""))) {
    throw new ApiError(403, "Tenant admins cannot assign administrative roles");
  }
}

module.exports = {
  assertTenantAdminCanAssignRoles,
  assertTenantAdminCanManageAccount,
  isTenantAdminAccount,
};
