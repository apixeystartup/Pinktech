const mongoose = require("mongoose");
const Tenant = require("../../models/tenant.model");
const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const FormSubmission = require("../../models/formSubmission.model");
const ExternalUser = require("../../models/externalUser.model");
const KycRecord = require("../../models/kycRecord.model");
const Notification = require("../../models/notification.model");
const AuditLog = require("../../models/auditLog.model");
const SchemaFormDispatch = require("../../models/schemaFormDispatch.model");

async function getSuperAdminStats() {
  const [totalTenants, activeTenants, suspendedTenants, tenantList] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: "ACTIVE" }),
    Tenant.countDocuments({ status: "SUSPENDED" }),
    Tenant.find().sort({ createdAt: -1 }).limit(5).select("name code status plan createdAt"),
  ]);

  const [totalUsers, activeUsers, invitedUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: "ACTIVE" }),
    User.countDocuments({ status: { $in: ["INVITED", "OTP_PENDING"] } }),
  ]);

  const [totalSubmissions, pendingSubmissions, completedSubmissions] = await Promise.all([
    FormSubmission.countDocuments(),
    FormSubmission.countDocuments({ status: { $in: ["PENDING", "IN_PROGRESS"] } }),
    FormSubmission.countDocuments({ status: "COMPLETED" }),
  ]);

  const [totalExternalUsers, pendingKyc] = await Promise.all([
    ExternalUser.countDocuments(),
    KycRecord.countDocuments({ status: "PENDING" }),
  ]);

  const recentActivity = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(8)
    .select("action metadata createdAt userId")
    .populate("userId", "name email")
    .lean();

  return {
    role: "super_admin",
    tenants: { total: totalTenants, active: activeTenants, suspended: suspendedTenants, recent: tenantList },
    users: { total: totalUsers, active: activeUsers, invited: invitedUsers },
    submissions: { total: totalSubmissions, pending: pendingSubmissions, completed: completedSubmissions },
    kyc: { externalUsers: totalExternalUsers, pending: pendingKyc },
    recentActivity,
  };
}

async function getTenantAdminStats(tenantId) {
  const tid = new mongoose.Types.ObjectId(tenantId);

  const [totalEmployees, activeEmployees, invitedEmployees, disabledEmployees] = await Promise.all([
    User.countDocuments({ tenantId: tid, orgLeftAt: null }),
    User.countDocuments({ tenantId: tid, status: "ACTIVE", orgLeftAt: null }),
    User.countDocuments({ tenantId: tid, status: { $in: ["INVITED", "OTP_PENDING"] }, orgLeftAt: null }),
    User.countDocuments({ tenantId: tid, status: { $in: ["DISABLED", "LOCKED"] }, orgLeftAt: null }),
  ]);

  const totalRoles = await Role.countDocuments({ tenantId: tid });

  const [totalDispatches, sentDispatches, inApprovalDispatches, approvedDispatches] = await Promise.all([
    SchemaFormDispatch.countDocuments({ tenantId: tid }),
    SchemaFormDispatch.countDocuments({ tenantId: tid, status: "SENT" }),
    SchemaFormDispatch.countDocuments({ tenantId: tid, status: "IN_APPROVAL" }),
    SchemaFormDispatch.countDocuments({ tenantId: tid, status: "APPROVED" }),
  ]);

  const [totalSubmissions, pendingSubmissions, completedSubmissions, rejectedSubmissions] = await Promise.all([
    FormSubmission.countDocuments({ tenantId: tid }),
    FormSubmission.countDocuments({ tenantId: tid, status: { $in: ["PENDING", "IN_PROGRESS"] } }),
    FormSubmission.countDocuments({ tenantId: tid, status: "COMPLETED" }),
    FormSubmission.countDocuments({ tenantId: tid, status: "REJECTED" }),
  ]);

  const [totalExternalUsers, pendingKyc, verifiedKyc] = await Promise.all([
    ExternalUser.countDocuments({ tenantId: tid }),
    KycRecord.countDocuments({ tenantId: tid, status: "PENDING" }),
    KycRecord.countDocuments({ tenantId: tid, status: "VERIFIED" }),
  ]);

  const [totalNotifications, failedNotifications] = await Promise.all([
    Notification.countDocuments({ tenantId: tid }),
    Notification.countDocuments({ tenantId: tid, status: "FAILED" }),
  ]);

  const recentActivity = await AuditLog.find({ tenantId: tid })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("action metadata createdAt userId")
    .populate("userId", "name email")
    .lean();

  return {
    role: "tenant_admin",
    employees: { total: totalEmployees, active: activeEmployees, invited: invitedEmployees, disabled: disabledEmployees },
    roles: { total: totalRoles },
    dispatches: { total: totalDispatches, sent: sentDispatches, inApproval: inApprovalDispatches, approved: approvedDispatches },
    submissions: { total: totalSubmissions, pending: pendingSubmissions, completed: completedSubmissions, rejected: rejectedSubmissions },
    kyc: { externalUsers: totalExternalUsers, pending: pendingKyc, verified: verifiedKyc },
    notifications: { total: totalNotifications, failed: failedNotifications },
    recentActivity,
  };
}

async function getEmployeeStats(tenantId, userId) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const uid = new mongoose.Types.ObjectId(userId);

  const user = await User.findById(uid).select("reportingToUserId currentPositionId name").lean();
  const [directReports, totalTeam] = await Promise.all([
    User.countDocuments({ tenantId: tid, reportingToUserId: uid, orgLeftAt: null }),
    User.countDocuments({ tenantId: tid, reportingToUserId: uid, status: "ACTIVE", orgLeftAt: null }),
  ]);

  const [mySubmissions, myPending, myCompleted] = await Promise.all([
    FormSubmission.countDocuments({ tenantId: tid, submittedBy: uid }),
    FormSubmission.countDocuments({ tenantId: tid, submittedBy: uid, status: { $in: ["PENDING", "IN_PROGRESS"] } }),
    FormSubmission.countDocuments({ tenantId: tid, submittedBy: uid, status: "COMPLETED" }),
  ]);

  const pendingApprovals = user?.currentPositionId
    ? await SchemaFormDispatch.countDocuments({
        tenantId: tid,
        approvalChainUserIds: uid,
        status: "IN_APPROVAL",
        currentApprovalIndex: { $gte: 0 },
      })
    : 0;

  const myNotifications = await Notification.countDocuments({
    tenantId: tid,
    recipientUserId: uid,
    status: { $in: ["PENDING", "SENT"] },
  });

  const recentActivity = await AuditLog.find({ tenantId: tid, userId: uid })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("action metadata createdAt")
    .lean();

  return {
    role: "employee",
    team: { directReports, totalActive: totalTeam },
    submissions: { total: mySubmissions, pending: myPending, completed: myCompleted },
    approvals: { pending: pendingApprovals },
    notifications: { unread: myNotifications },
    recentActivity,
  };
}

module.exports = {
  getSuperAdminStats,
  getTenantAdminStats,
  getEmployeeStats,
};
