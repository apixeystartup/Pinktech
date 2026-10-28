const mongoose = require("mongoose");
const Tenant = require("../models/tenant.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const Module = require("../models/module.model");
const ExternalUser = require("../models/externalUser.model");
const Submission = require("../models/submission.model");
const ApiError = require("@pink/shared").ApiError;
const { isPlatformTenant } = require("@pink/shared");

// Access control is disabled, so permission codes cannot tell platform super
// admins apart from tenant admins. Resolve the account role from the user's
// roles and tenant ownership (see the matching helper in the auth service):
// Pinktech (the PLATFORM tenant) is the only tenant that owns a super admin,
// and that super admin applies to every tenant — individual tenants never have
// one of their own.
async function resolveAccountRole(auth) {
  const user = await User.findById(auth.userId).select("email roleIds tenantId").lean();
  if (!user) return "employee";

  const tenant = await Tenant.findById(user.tenantId).select("email adminUserId code").lean();

  const roleIds = user.roleIds || [];
  const roles = roleIds.length
    ? await Role.find({ _id: { $in: roleIds }, tenantId: user.tenantId }).select("name type").lean()
    : [];
  if (isPlatformTenant(tenant) && roles.some((r) => r.type === "SYSTEM")) return "super_admin";

  const tenantEmail = String(tenant?.email || "").toLowerCase().trim();
  const userEmail = String(user.email || "").toLowerCase().trim();
  const isTenantAdmin =
    (tenant?.adminUserId && String(tenant.adminUserId) === String(user._id)) ||
    (tenantEmail && tenantEmail === userEmail) ||
    roles.some((r) => /admin/i.test(r.name || ""));
  return isTenantAdmin ? "tenant_admin" : "employee";
}

function toOid(value) {
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
}

async function getRoleNameMap(tenantId, users) {
  const roleIds = [...new Set(users.flatMap((u) => u.roleIds || []))];
  if (!roleIds.length) return new Map();
  const roles = await Role.find({ _id: { $in: roleIds }, tenantId }).select("name").lean();
  return new Map(roles.map((r) => [String(r._id), r.name]));
}

function roleNamesFor(user, roleMap) {
  return (
    (user.roleIds || []).map((rid) => roleMap.get(String(rid))).filter(Boolean).join(", ") || "—"
  );
}

async function countByGroup(pipeline) {
  const rows = await User.aggregate(pipeline);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

// Every dashboard (super admin, tenant admin, employee) counts "doctors" from
// the same source: ExternalUser docs created by that employee. Previously the
// employee view counted User.invitedByUserId instead, so the same activity
// showed up as different numbers depending on who was looking.
async function doctorsCreatedByMap(tenantId, userIds) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length || !tenantId) return new Map();
  const rows = await ExternalUser.aggregate([
    { $match: { tenantId, createdByUserId: { $in: ids } } },
    { $group: { _id: "$createdByUserId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

// Shared definition of an "employee" everywhere: still in the org (not marked
// as left) and occupying a real seat (vacant seats are excluded).
function activeEmployeeFilter(tenantId) {
  return { ...(tenantId ? { tenantId } : {}), orgLeftAt: null, orgSeatVacant: { $ne: true } };
}

async function getSuperAdminStats() {
  // The platform (Pinktech's own tenant) is not a customer tenant: it is left
  // out of the tenant table and the tenant/employee/user roll-up totals.
  const tenants = (await Tenant.find({}).sort({ createdAt: -1 }).lean()).filter(
    (t) => !isPlatformTenant(t),
  );

  const empMap = await countByGroup([
    { $match: activeEmployeeFilter() },
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]);
  const userMap = await countByGroup([
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]);

  const formGroups = await Module.aggregate([
    { $match: { moduleType: "FORM", tenantId: { $ne: null } } },
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]);
  const formMap = new Map(formGroups.map((g) => [String(g._id), g.count]));

  const moduleMeta = await Module.find({ moduleType: "FORM", tenantId: { $ne: null } })
    .select("_id tenantId")
    .lean();
  const moduleToTenant = new Map(moduleMeta.map((m) => [String(m._id), String(m.tenantId)]));

  const doctorGroups = await ExternalUser.aggregate([
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]);
  const doctorMap = new Map(doctorGroups.map((g) => [String(g._id), g.count]));

  const submissionGroups = await Submission.aggregate([
    { $group: { _id: "$moduleId", count: { $sum: 1 } } },
  ]);
  const submissionMap = new Map();
  for (const g of submissionGroups) {
    const tenantKey = moduleToTenant.get(String(g._id));
    if (!tenantKey) continue;
    submissionMap.set(tenantKey, (submissionMap.get(tenantKey) || 0) + g.count);
  }

  const totalDoctors = await ExternalUser.countDocuments({});
  const formsSubmitted = await Submission.countDocuments({});

  const tenantRows = tenants.map((t) => ({
    tenantId: t._id,
    name: t.name,
    code: t.code,
    plan: t.plan || "starter",
    status: t.status,
    employeeCount: empMap.get(String(t._id)) || 0,
    userCount: userMap.get(String(t._id)) || 0,
    doctorCount: doctorMap.get(String(t._id)) || 0,
    formCount: formMap.get(String(t._id)) || 0,
    formSubmittedCount: submissionMap.get(String(t._id)) || 0,
    startDate: t.organizationStartDate || t.createdAt,
    createdAt: t.createdAt,
  }));

  return {
    role: "super_admin",
    summary: {
      totalTenants: tenants.length,
      totalEmployees: tenantRows.reduce((s, r) => s + r.employeeCount, 0),
      totalUsers: tenantRows.reduce((s, r) => s + r.userCount, 0),
      totalForms: tenantRows.reduce((s, r) => s + r.formCount, 0),
      totalDoctors,
      formsSubmitted,
    },
    tenants: tenantRows,
  };
}

async function getTenantEmployees(tenantId, auth) {
  const oid = toOid(tenantId);
  if (!oid) throw new ApiError(400, "Invalid tenant id");
  if ((await resolveAccountRole(auth)) !== "super_admin") throw new ApiError(403, "Super admin access required");

  const employeeDocs = await User.find(activeEmployeeFilter(oid))
    .select("name email empCode roleIds reportingToUserId status invitedByUserId")
    .sort({ name: 1 })
    .lean();

  const roleMap = await getRoleNameMap(oid, employeeDocs);

  const managerIds = [...new Set(employeeDocs.map((u) => u.reportingToUserId).filter(Boolean))];
  const managers = managerIds.length
    ? await User.find({ _id: { $in: managerIds }, tenantId: oid }).select("name").lean()
    : [];
  const managerMap = new Map(managers.map((m) => [String(m._id), m.name]));

  const reportCountMap = new Map();
  for (const u of employeeDocs) {
    const managerKey = String(u.reportingToUserId || "");
    reportCountMap.set(managerKey, (reportCountMap.get(managerKey) || 0) + 1);
  }
  const doctorCountMap = await doctorsCreatedByMap(
    oid,
    employeeDocs.map((u) => u._id),
  );

  const formsPerUser = await Module.aggregate([
    { $match: { tenantId: oid, moduleType: "FORM", createdByUserId: { $ne: null } } },
    { $group: { _id: "$createdByUserId", count: { $sum: 1 } } },
  ]);
  const formCountMap = new Map(formsPerUser.map((r) => [String(r._id), r.count]));

  return {
    tenantId: oid,
    total: employeeDocs.length,
    employees: employeeDocs.map((u) => ({
      userId: u._id,
      name: u.name,
      email: u.email,
      empCode: u.empCode || null,
      status: u.status || null,
      roleIds: (u.roleIds || []).map((r) => String(r)),
      roles: roleNamesFor(u, roleMap),
      reportingTo: u.reportingToUserId
        ? { name: managerMap.get(String(u.reportingToUserId)) || "—" }
        : null,
      directReportCount: reportCountMap.get(String(u._id)) || 0,
      formsCreated: formCountMap.get(String(u._id)) || 0,
      usersCreated: doctorCountMap.get(String(u._id)) || 0,
    })),
  };
}

async function buildTenantDoctors(oid) {
  const doctorDocs = await ExternalUser.find({ tenantId: oid }).sort({ name: 1 }).lean();

  const creatorIds = [...new Set(doctorDocs.map((d) => String(d.createdByUserId)).filter(Boolean))];
  const creators = creatorIds.length
    ? await User.find({ _id: { $in: creatorIds }, tenantId: oid })
        .select("name empCode roleIds reportingToUserId")
        .lean()
    : [];

  const creatorById = new Map(creators.map((c) => [String(c._id), c]));
  const roleMap = await getRoleNameMap(oid, creators);

  const managerIds = [...new Set(creators.map((u) => u.reportingToUserId).filter(Boolean))];
  const managers = managerIds.length
    ? await User.find({ _id: { $in: managerIds }, tenantId: oid }).select("name").lean()
    : [];
  const managerMap = new Map(managers.map((m) => [String(m._id), m.name]));

  let formCountMap = new Map();
  if (doctorDocs.length && mongoose.connection?.db) {
    const rows = await mongoose.connection.db
      .collection("schemformdispatches")
      .aggregate([
        { $match: { externalUserId: { $in: doctorDocs.map((d) => d._id) } } },
        { $group: { _id: "$externalUserId", count: { $sum: 1 } } },
      ])
      .toArray();
    formCountMap = new Map(rows.map((r) => [String(r._id), r.count]));
  }

  return {
    total: doctorDocs.length,
    doctors: doctorDocs.map((d) => {
      const creator = creatorById.get(String(d.createdByUserId));
      return {
        externalUserId: d._id,
        name: d.name,
        email: d.email,
        status: d.status || null,
        createdBy: creator
          ? {
              name: creator.name,
              empCode: creator.empCode || null,
              role: roleNamesFor(creator, roleMap),
              reportingTo: creator.reportingToUserId
                ? { name: managerMap.get(String(creator.reportingToUserId)) || "—" }
                : null,
            }
          : null,
        formsCreated: formCountMap.get(String(d._id)) || 0,
      };
    }),
  };
}

async function getTenantDoctors(tenantId, auth) {
  const oid = toOid(tenantId);
  if (!oid) throw new ApiError(400, "Invalid tenant id");
  if ((await resolveAccountRole(auth)) !== "super_admin") throw new ApiError(403, "Super admin access required");

  const result = await buildTenantDoctors(oid);
  return { tenantId: oid, ...result };
}

async function getTenantAdminStats(auth, tenantId) {
  const activeFilter = activeEmployeeFilter(tenantId);
  const totalEmployees = await User.countDocuments(activeFilter);
  const totalUsers = await User.countDocuments({ tenantId });
  const totalDoctors = await ExternalUser.countDocuments({ tenantId });
  const tenantFormModules = await Module.find({ tenantId, moduleType: "FORM" }).select("_id").lean();
  const formsCreated = tenantFormModules.length;
  const formsSubmitted = tenantFormModules.length
    ? await Submission.countDocuments({ moduleId: { $in: tenantFormModules.map((m) => m._id) } })
    : 0;

  const employeeDocs = await User.find(activeFilter)
    .select("name email empCode roleIds reportingToUserId status invitedByUserId credentialsSentCount passwordResetRequestedAt")
    .sort({ name: 1 })
    .lean();

  const roleMap = await getRoleNameMap(tenantId, employeeDocs);

  const managerIds = [...new Set(employeeDocs.map((u) => u.reportingToUserId).filter(Boolean))];
  const managers = managerIds.length
    ? await User.find({ _id: { $in: managerIds }, tenantId }).select("name").lean()
    : [];
  const managerMap = new Map(managers.map((m) => [String(m._id), m.name]));

  const formsPerUser = await Module.aggregate([
    { $match: { tenantId, moduleType: "FORM", createdByUserId: { $ne: null } } },
    { $group: { _id: "$createdByUserId", count: { $sum: 1 } } },
  ]);
  const formCountMap = new Map(formsPerUser.map((r) => [String(r._id), r.count]));

  const usersPerCreator = await ExternalUser.aggregate([
    { $match: { tenantId } },
    { $group: { _id: "$createdByUserId", count: { $sum: 1 } } },
  ]);
  const userCountMap = new Map(usersPerCreator.map((r) => [String(r._id), r.count]));

  const reportCountMap = new Map();
  for (const u of employeeDocs) {
    const key = String(u.reportingToUserId || "");
    reportCountMap.set(key, (reportCountMap.get(key) || 0) + 1);
  }

  const employees = employeeDocs.map((u) => ({
    userId: u._id,
    name: u.name,
    email: u.email,
    empCode: u.empCode || null,
    status: u.status || null,
    credentialsSentCount: Number(u.credentialsSentCount) || 0,
    passwordResetRequestedAt: u.passwordResetRequestedAt || null,
    roleIds: (u.roleIds || []).map((r) => String(r)),
    roles: roleNamesFor(u, roleMap),
    reportingTo: u.reportingToUserId
      ? { name: managerMap.get(String(u.reportingToUserId)) || "—" }
      : null,
    directReportCount: reportCountMap.get(String(u._id)) || 0,
    formsCreated: formCountMap.get(String(u._id)) || 0,
    usersCreated: userCountMap.get(String(u._id)) || 0,
  }));

  const { doctors } = await buildTenantDoctors(tenantId);

  return {
    role: "tenant_admin",
    summary: { totalEmployees, totalUsers, totalDoctors, formsCreated, formsSubmitted },
    employees,
    doctors,
  };
}

async function getEmployeeStats(auth, tenantId) {
  const currentUser = await User.findOne({ _id: auth.userId, tenantId })
    .select("name email empCode roleIds status")
    .lean();
  if (!currentUser) throw new ApiError(404, "User not found");

  const roleMap = await getRoleNameMap(tenantId, [currentUser]);

  const myForms = await Module.find({
    tenantId,
    moduleType: "FORM",
    createdByUserId: currentUser._id,
  })
    .select("name status isPublished createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const directReportDocs = await User.find({
    tenantId,
    reportingToUserId: currentUser._id,
    orgLeftAt: null,
    orgSeatVacant: { $ne: true },
  })
    .select("name email empCode roleIds status")
    .sort({ name: 1 })
    .lean();

  const reportRoleMap = await getRoleNameMap(tenantId, directReportDocs);
  const directReports = directReportDocs.map((u) => ({
    userId: u._id,
    name: u.name,
    email: u.email,
    empCode: u.empCode || null,
    status: u.status || null,
    roles: roleNamesFor(u, reportRoleMap),
  }));

  // Same source of truth as the admin and super-admin dashboards.
  const usersCreatedDocs = await ExternalUser.find({
    tenantId,
    createdByUserId: currentUser._id,
  })
    .select("name email status createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const usersCreated = usersCreatedDocs.map((u) => ({
    userId: u._id,
    name: u.name,
    email: u.email,
    empCode: null,
    status: u.status || null,
    createdAt: u.createdAt,
  }));

  return {
    role: "employee",
    summary: {
      formsCreated: myForms.length,
      directReports: directReports.length,
      usersCreated: usersCreated.length,
    },
    currentUser: {
      name: currentUser.name,
      email: currentUser.email,
      empCode: currentUser.empCode || null,
      roles: roleNamesFor(currentUser, roleMap),
      status: currentUser.status || null,
    },
    myForms: myForms.map((f) => ({
      formId: f._id,
      name: f.name,
      status: f.status || (f.isPublished ? "PUBLISHED" : "DRAFT"),
      createdAt: f.createdAt,
    })),
    directReports,
    usersCreated,
  };
}

async function getDashboardStats(auth) {
  const accountRole = await resolveAccountRole(auth);
  if (accountRole === "super_admin") {
    if (auth.actingAsTenantId) {
      if (!mongoose.Types.ObjectId.isValid(String(auth.actingAsTenantId))) {
        throw new ApiError(400, "Invalid tenant context");
      }
      return getTenantAdminStats(auth, new mongoose.Types.ObjectId(String(auth.actingAsTenantId)));
    }
    return getSuperAdminStats();
  }

  // Non-super users are always scoped to their home tenant, even if a stale
  // X-Tenant-Id override is present, so an admin can never see another org.
  const tenantId = auth.baseTenantId || auth.tenantId;
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    throw new ApiError(400, "Invalid tenant context");
  }
  const oid = new mongoose.Types.ObjectId(String(tenantId));

  if (accountRole === "tenant_admin") {
    return getTenantAdminStats(auth, oid);
  }

  return getEmployeeStats(auth, oid);
}

module.exports = { getDashboardStats, getTenantEmployees, getTenantDoctors };
