const mongoose = require("mongoose");

async function dashboardStats(req, res) {
  try {
    const userId = req.headers["x-auth-user-id"];
    const tenantId = req.headers["x-auth-tenant-id"];
    const baseTenantId = req.headers["x-auth-base-tenant-id"];
    let permissionCodes = [];
    try {
      permissionCodes = JSON.parse(req.headers["x-auth-permission-codes"] || "[]");
    } catch {
      permissionCodes = [];
    }

    const isSuperAdmin = permissionCodes.includes("*");
    const isTenantAdmin = permissionCodes.includes("tenant.manage");

    const User = mongoose.model("User");
    const Tenant = mongoose.model("Tenant");

    if (isSuperAdmin) {
      const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
      const tenantIds = tenants.map((t) => t._id);

      const tenantEmployeeCounts = await User.aggregate([
        { $match: { tenantId: { $in: tenantIds }, orgFromWorkbook: true, orgLeftAt: null } },
        { $group: { _id: "$tenantId", count: { $sum: 1 } } },
      ]);
      const empCountMap = new Map(tenantEmployeeCounts.map((g) => [String(g._id), g.count]));

      const tenantUserCounts = await User.aggregate([
        { $match: { tenantId: { $in: tenantIds }, orgFromWorkbook: { $ne: true } } },
        { $group: { _id: "$tenantId", count: { $sum: 1 } } },
      ]);
      const userCountMap = new Map(tenantUserCounts.map((g) => [String(g._id), g.count]));

      const totalEmployees = tenantEmployeeCounts.reduce((s, g) => s + g.count, 0);
      const totalUsers = tenantUserCounts.reduce((s, g) => s + g.count, 0);
      const totalTenants = tenants.length;

      const tenantBreakdown = tenants.map((t) => ({
        tenantId: t._id,
        name: t.name,
        code: t.code,
        status: t.status,
        plan: t.plan,
        employeeCount: empCountMap.get(String(t._id)) || 0,
        userCount: userCountMap.get(String(t._id)) || 0,
        createdAt: t.createdAt,
      }));

      return res.json({
        role: "super_admin",
        summary: { totalTenants, totalEmployees, totalUsers },
        tenants: tenantBreakdown,
      });
    }

    const effectiveTenantId = tenantId || baseTenantId;

    const allEmployees = await User.find({
      tenantId: effectiveTenantId,
      orgFromWorkbook: true,
      orgLeftAt: null,
    })
      .populate("roleIds", "name")
      .populate("reportingToUserId", "name email empCode")
      .sort({ createdAt: -1 })
      .lean();

    const allNonWorkbookUsers = await User.find({
      tenantId: effectiveTenantId,
      orgFromWorkbook: { $ne: true },
    })
      .lean();

    const currentUser = await User.findOne({ _id: userId, tenantId: effectiveTenantId }).lean();

    const totalEmployees = allEmployees.length;
    const totalUsers = allNonWorkbookUsers.length;

    const createdByManagerMap = new Map();
    for (const u of allNonWorkbookUsers) {
      const mid = u.reportingToUserId ? String(u.reportingToUserId) : "__none__";
      createdByManagerMap.set(mid, (createdByManagerMap.get(mid) || 0) + 1);
    }

    const employeeBreakdown = allEmployees.map((emp) => {
      const empId = String(emp._id);
      return {
        userId: emp._id,
        name: emp.name,
        email: emp.email,
        empCode: emp.empCode,
        status: emp.status,
        roles: (emp.roleIds || []).map((r) => r.name).join(", "),
        reportingTo: emp.reportingToUserId
          ? { name: emp.reportingToUserId.name, email: emp.reportingToUserId.email }
          : null,
        directReportCount: createdByManagerMap.get(empId) || 0,
      };
    });

    let myDirectReports = [];
    let myManagedUsers = [];
    let mySubtreeStats = { totalReports: 0, totalUsersManaged: 0 };

    if (currentUser) {
      const myId = String(currentUser._id);
      myDirectReports = allEmployees
        .filter((emp) => emp.reportingToUserId && String(emp.reportingToUserId._id || emp.reportingToUserId) === myId)
        .map((emp) => ({
          userId: emp._id,
          name: emp.name,
          email: emp.email,
          empCode: emp.empCode,
          roles: (emp.roleIds || []).map((r) => r.name).join(", "),
        }));

      const subtreeIds = new Set();
      const queue = [myId];
      while (queue.length) {
        const mid = queue.shift();
        for (const emp of allEmployees) {
          const empManagerId = emp.reportingToUserId
            ? String(emp.reportingToUserId._id || emp.reportingToUserId)
            : "";
          if (empManagerId === mid && !subtreeIds.has(String(emp._id))) {
            subtreeIds.add(String(emp._id));
            queue.push(String(emp._id));
          }
        }
      }

      mySubtreeStats.totalReports = subtreeIds.size;
      myManagedUsers = allNonWorkbookUsers
        .filter((u) => {
          if (u.reportingToUserId && String(u.reportingToUserId) === myId) return true;
          return subtreeIds.has(String(u.reportingToUserId || ""));
        })
        .map((u) => ({
          userId: u._id,
          name: u.name,
          email: u.email,
          empCode: u.empCode,
          status: u.status,
          reportingTo: u.reportingToUserId,
        }));
      mySubtreeStats.totalUsersManaged = myManagedUsers.length;
    }

    const role = isSuperAdmin || isTenantAdmin ? "tenant_admin" : "employee";

    return res.json({
      role,
      summary: { totalEmployees, totalUsers },
      employees: employeeBreakdown,
      currentUser: currentUser
        ? { userId: currentUser._id, name: currentUser.name, email: currentUser.email, empCode: currentUser.empCode }
        : null,
      directReports: myDirectReports,
      managedUsers: myManagedUsers,
      subtreeStats: mySubtreeStats,
    });
  } catch (error) {
    console.error("[dashboard] Error:", error);
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
}

module.exports = { handle: dashboardStats };
