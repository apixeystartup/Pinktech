const mongoose = require("mongoose");
const Tenant = require("../models/tenant.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const ApiError = require("@pink/shared").ApiError;

function isSuperAdmin(auth) {
  return (
    (auth.permissionCodes || []).includes("*") ||
    (auth.permissionCodes || []).includes("tenant.manage")
  );
}

async function getDashboardStats(auth) {
  const tenantId = auth.tenantId;
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    throw new ApiError(400, "Invalid tenant context");
  }

  const superAdmin = isSuperAdmin(auth);

  if (superAdmin) {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();

    const empPipeline = [
      { $match: { orgFromWorkbook: true, orgLeftAt: null } },
      { $group: { _id: "$tenantId", count: { $sum: 1 } } },
    ];
    const empGroups = await User.aggregate(empPipeline);
    const empMap = new Map(empGroups.map((g) => [String(g._id), g.count]));

    const userPipeline = [
      { $group: { _id: "$tenantId", count: { $sum: 1 } } },
    ];
    const userGroups = await User.aggregate(userPipeline);
    const userMap = new Map(userGroups.map((g) => [String(g._id), g.count]));

    const tenantRows = tenants.map((t) => ({
      tenantId: t._id,
      name: t.name,
      code: t.code,
      plan: t.plan || "starter",
      status: t.status,
      employeeCount: empMap.get(String(t._id)) || 0,
      userCount: userMap.get(String(t._id)) || 0,
      createdAt: t.createdAt,
    }));

    const totalEmployees = tenantRows.reduce((s, r) => s + r.employeeCount, 0);
    const totalUsers = tenantRows.reduce((s, r) => s + r.userCount, 0);

    return {
      role: "super_admin",
      summary: {
        totalTenants: tenants.length,
        totalEmployees,
        totalUsers,
      },
      tenants: tenantRows,
    };
  }

  const currentUser = await User.findOne({ _id: auth.userId, tenantId })
    .select("name email empCode roleIds reportingToUserId status")
    .lean();

  if (!currentUser) {
    throw new ApiError(404, "User not found");
  }

  const roleIds = currentUser.roleIds || [];
  const roles = roleIds.length
    ? await Role.find({ _id: { $in: roleIds }, tenantId }).select("name").lean()
    : [];
  const roleNames = roles.map((r) => r.name).join(", ");

  const activeFilter = { tenantId, orgLeftAt: null };
  const totalEmployees = await User.countDocuments(activeFilter);
  const totalUsers = await User.countDocuments({ tenantId });

  const directReportDocs = await User.find({
    tenantId,
    reportingToUserId: auth.userId,
    orgLeftAt: null,
  })
    .select("name email empCode roleIds")
    .lean();

  const allReportIds = directReportDocs.map((u) => u._id);
  const subtreeFilter = { tenantId, orgLeftAt: null };
  if (allReportIds.length) {
    subtreeFilter._id = { $in: allReportIds };
  } else {
    subtreeFilter._id = { $in: [] };
  }
  const totalReports = await User.countDocuments(subtreeFilter);
  const totalUsersManaged = directReportDocs.length;

  const reportRoleIds = [...new Set(directReportDocs.flatMap((u) => u.roleIds || []))];
  const reportRoles = reportRoleIds.length
    ? await Role.find({ _id: { $in: reportRoleIds }, tenantId }).select("name").lean()
    : [];
  const reportRoleMap = new Map(reportRoles.map((r) => [String(r._id), r.name]));

  const directReports = directReportDocs.map((u) => ({
    userId: u._id,
    name: u.name,
    email: u.email,
    empCode: u.empCode || null,
    roles:
      (u.roleIds || []).map((rid) => reportRoleMap.get(String(rid))).filter(Boolean).join(", ") ||
      "—",
  }));

  const managedUsers = directReports.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    empCode: r.empCode,
  }));

  const tenantAdmin = (auth.permissionCodes || []).includes("tenant.manage");
  const role = tenantAdmin ? "tenant_admin" : "employee";

  if (tenantAdmin) {
    const employeeDocs = await User.find(activeFilter)
      .select("name email empCode roleIds reportingToUserId")
      .lean();

    const empRoleIds = [...new Set(employeeDocs.flatMap((u) => u.roleIds || []))];
    const empRoles = empRoleIds.length
      ? await Role.find({ _id: { $in: empRoleIds }, tenantId }).select("name").lean()
      : [];
    const empRoleMap = new Map(empRoles.map((r) => [String(r._id), r.name]));

    const managerIds = [...new Set(employeeDocs.map((u) => u.reportingToUserId).filter(Boolean))];
    const managers = managerIds.length
      ? await User.find({ _id: { $in: managerIds } }).select("name").lean()
      : [];
    const managerMap = new Map(managers.map((m) => [String(m._id), m.name]));

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
      roles:
        (u.roleIds || []).map((rid) => empRoleMap.get(String(rid))).filter(Boolean).join(", ") ||
        "—",
      reportingTo: u.reportingToUserId
        ? { name: managerMap.get(String(u.reportingToUserId)) || "—" }
        : null,
      directReportCount: reportCountMap.get(String(u._id)) || 0,
    }));

    return {
      role,
      summary: { totalEmployees, totalUsers },
      employees,
    };
  }

  return {
    role,
    summary: { totalEmployees, totalUsers },
    currentUser: {
      name: currentUser.name,
      email: currentUser.email,
      empCode: currentUser.empCode || null,
      roles: roleNames || "—",
    },
    directReports,
    managedUsers,
    subtreeStats: { totalUsersManaged, totalReports },
  };
}

module.exports = { getDashboardStats };
