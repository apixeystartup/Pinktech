const User = require("../models/user.model");
const Role = require("../models/role.model");
const Tenant = require("../models/tenant.model");
const { isPlatformTenant, PLATFORM_TENANT_CODES } = require("@pink/shared");

/** Same idea as People list: include invited/onboarding users, exclude only disabled/locked. */
const NOTIFIABLE_USER_FILTER = { status: { $nin: ["DISABLED", "LOCKED"] } };

async function getAccountRole(req) {
  if (req.auth?.isSuperAdmin || req.auth?.accountRole === "super_admin") return "super_admin";
  if (req.auth?.accountRole === "tenant_admin") return "tenant_admin";

  const user = await User.findById(req.auth.userId).select("tenantId email roleIds").lean();
  if (!user) return "employee";
  const baseTenant = await Tenant.findById(user.tenantId).select("code adminUserId email").lean();
  const roles = user.roleIds?.length
    ? await Role.find({ _id: { $in: user.roleIds }, tenantId: user.tenantId }).select("name type").lean()
    : [];
  if (isPlatformTenant(baseTenant) && roles.some((role) => role.type === "SYSTEM")) return "super_admin";

  const isTenantAdmin =
    (baseTenant?.adminUserId && String(baseTenant.adminUserId) === String(user._id)) ||
    (baseTenant?.email &&
      String(baseTenant.email).toLowerCase() === String(user.email || "").toLowerCase()) ||
    roles.some((role) => /admin/i.test(role.name || ""));
  return isTenantAdmin ? "tenant_admin" : "employee";
}

async function listNotificationRecipients(req) {
  const accountRole = await getAccountRole(req);
  const contextTenant = await Tenant.findById(req.tenantId).select("name code status").lean();
  if (!contextTenant) return [];

  let scopedTenants;
  if (accountRole === "super_admin" && !req.auth.actingAsTenantId && isPlatformTenant(contextTenant)) {
    scopedTenants = await Tenant.find({ status: "ACTIVE" }).select("name code status adminUserId email").lean();
  } else {
    scopedTenants = await Tenant.find({ _id: req.tenantId, status: "ACTIVE" })
      .select("name code status adminUserId email")
      .lean();
  }

  const platformTenants = await Tenant.find({ code: { $in: PLATFORM_TENANT_CODES }, status: "ACTIVE" })
    .select("name code status adminUserId email")
    .lean();
  const tenantsById = new Map(
    [...scopedTenants, ...platformTenants].map((tenant) => [String(tenant._id), tenant]),
  );
  const tenantIds = [...tenantsById.keys()];
  if (!tenantIds.length) return [];

  const users = await User.find({ tenantId: { $in: tenantIds }, ...NOTIFIABLE_USER_FILTER })
    .select("name email status tenantId roleIds")
    .sort({ name: 1 })
    .lean();
  const roleIds = [...new Set(users.flatMap((user) => (user.roleIds || []).map(String)))];
  const roles = roleIds.length
    ? await Role.find({ _id: { $in: roleIds } }).select("name type").lean()
    : [];
  const roleMap = new Map(roles.map((role) => [String(role._id), role]));

  return users.flatMap((user) => {
    const tenant = tenantsById.get(String(user.tenantId));
    const userRoles = (user.roleIds || []).map((id) => roleMap.get(String(id))).filter(Boolean);
    const isSuperAdmin = isPlatformTenant(tenant) && userRoles.some((role) => role.type === "SYSTEM");
    if (isPlatformTenant(tenant) && !isSuperAdmin) return [];

    const isTenantAdmin =
      !isPlatformTenant(tenant) &&
      ((tenant?.adminUserId && String(tenant.adminUserId) === String(user._id)) ||
      (tenant?.email && String(tenant.email).toLowerCase() === String(user.email || "").toLowerCase()) ||
        userRoles.some((role) => /admin/i.test(role.name || "")));
    const recipientRole = isSuperAdmin ? "Super admin" : isTenantAdmin ? "Tenant admin" : "Employee";
    return [{
      _id: user._id,
      name: user.name,
      email: user.email,
      status: user.status,
      accountRole: recipientRole,
      tenantName: tenant?.name || "",
    }];
  });
}

async function assertRecipientsInScope(req, recipientIds) {
  const allowedRecipients = await listNotificationRecipients(req);
  const allowedIds = new Set(allowedRecipients.map((user) => String(user._id)));
  return recipientIds.every((id) => allowedIds.has(String(id)));
}

module.exports = {
  getAccountRole,
  listNotificationRecipients,
  assertRecipientsInScope,
};
