const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("../../models/user.model");
const Tenant = require("../../models/tenant.model");
const env = require("../../config/env");
const ApiError = require("../../common/errors/ApiError");
const { writeAudit } = require("../../services/audit.service");
const { sendEmail } = require("../notifications/notification.adapter");

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

function buildEmployeeCredsEmail({ tenantName, name, email, password, empCode, loginUrl }) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <div style="background: linear-gradient(135deg, #4f46e5, #0891b2); padding: 28px; border-radius: 14px 14px 0 0; text-align: center;">
        <h1 style="color: #fff; font-size: 1.4rem; margin: 0; letter-spacing: -0.02em;">Approve.io</h1>
        <p style="color: rgba(255,255,255,0.8); font-size: 0.85rem; margin: 6px 0 0;">Your Login Credentials</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; padding: 28px; border-radius: 0 0 14px 14px;">
        <p style="font-size: 0.95rem; line-height: 1.6; margin: 0 0 16px;">
          Your account has been created on <strong>${tenantName}</strong> (Approve.io). Your login credentials are:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.9rem;">
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Name</td><td style="padding: 8px 12px;">${name}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Employee ID</td><td style="padding: 8px 12px; font-family: monospace;">${empCode}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Email</td><td style="padding: 8px 12px;">${email}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Password</td><td style="padding: 8px 12px; font-family: monospace; background: #fef3c7; border-radius: 4px;">${password}</td></tr>
        </table>
        <p style="font-size: 0.85rem; color: #64748b; margin: 16px 0 0;">
          Use your email or Employee ID to sign in. You will be prompted to change your password after first login.
        </p>
        <div style="text-align: center; margin: 24px 0 8px;">
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(155deg, #6366f1, #4f46e5, #0e7490); color: #fff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 0.9rem;">Sign in to Approve.io</a>
        </div>
      </div>
      <p style="font-size: 0.75rem; color: #94a3b8; text-align: center; margin-top: 16px;">
        This is an automated message from Approve.io. Do not share these credentials.
      </p>
    </div>
  `;
}

async function listUsers(tenantId, options = {}) {
  const roleId = options.roleId ? String(options.roleId).trim() : "";
  const query = { tenantId };
  if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
    query.roleIds = new mongoose.Types.ObjectId(roleId);
    query.orgLeftAt = null;
    query.orgSeatVacant = { $ne: true };
  }
  return User.find(query)
    .populate("roleIds")
    .populate("currentPositionId")
    .populate("reportingToUserId", "name email empCode")
    .sort({ createdAt: -1 });
}

async function updateUser(tenantId, userId, payload, actor) {
  const user = await User.findOne({ _id: userId, tenantId });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const trimmedEmp = payload.empCode !== undefined && payload.empCode ? String(payload.empCode).trim() : null;
  if (trimmedEmp) {
    const dup = await User.findOne({ tenantId, empCode: trimmedEmp, _id: { $ne: userId } });
    if (dup) {
      throw new ApiError(409, "Employee ID is already used by another person in this tenant");
    }
  }

  const update = {};
  if (payload.name !== undefined) {
    update.name = payload.name;
  }
  if (payload.empCode !== undefined) {
    update.empCode = trimmedEmp;
  }
  if (payload.roleIds !== undefined) {
    update.roleIds = payload.roleIds;
  }
  if (payload.currentPositionId !== undefined) {
    const pid = payload.currentPositionId && String(payload.currentPositionId).trim();
    update.currentPositionId = pid || null;
  }
  if (payload.reportingToUserId !== undefined) {
    const rid = payload.reportingToUserId && String(payload.reportingToUserId).trim();
    if (rid && rid === String(userId)) {
      throw new ApiError(400, "Employee cannot report to self");
    }
    update.reportingToUserId = rid || null;
  }
  if (payload.designationOverride !== undefined) {
    update.designationOverride = payload.designationOverride ? String(payload.designationOverride).trim() : null;
  }
  for (const geo of ["zone", "region", "state", "hq"]) {
    if (payload[geo] !== undefined) {
      update[geo] = payload[geo] ? String(payload[geo]).trim() : null;
    }
  }

  const updated = await User.findOneAndUpdate({ _id: userId, tenantId }, update, { returnDocument: "after" })
    .populate("roleIds")
    .populate("currentPositionId")
    .populate("reportingToUserId", "name email empCode");

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_UPDATED",
    metadata: { targetUserId: userId, fields: Object.keys(update) },
  });

  return updated;
}

async function deleteUser(tenantId, userId, actor) {
  const user = await User.findOneAndDelete({ _id: userId, tenantId });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_DELETED",
    metadata: { targetUserId: userId, email: user.email },
  });
}

async function bulkAssignReporting(tenantId, payload, actor) {
  const uniqueUserIds = [...new Set((payload.userIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueUserIds.length) {
    throw new ApiError(400, "No employees selected");
  }
  const reportingToUserId = payload.reportingToUserId ? String(payload.reportingToUserId).trim() : null;
  if (reportingToUserId && uniqueUserIds.includes(reportingToUserId)) {
    throw new ApiError(400, "Employee cannot report to self");
  }
  if (reportingToUserId) {
    const manager = await User.findOne({ _id: reportingToUserId, tenantId });
    if (!manager) {
      throw new ApiError(404, "Reporting person not found");
    }
  }
  const result = await User.updateMany(
    { tenantId, _id: { $in: uniqueUserIds } },
    { $set: { reportingToUserId: reportingToUserId || null } },
  );
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_REPORTING_ASSIGNED_BULK",
    metadata: { count: result.modifiedCount || 0, reportingToUserId, userIds: uniqueUserIds },
  });
  return { modifiedCount: result.modifiedCount || 0 };
}

async function getUserSubtree(tenantId, rootUserId) {
  const root = await User.findOne({ _id: rootUserId, tenantId })
    .populate("roleIds")
    .populate("reportingToUserId", "name email empCode");
  if (!root) {
    throw new ApiError(404, "Employee not found");
  }
  const allUsers = await User.find({ tenantId })
    .populate("roleIds")
    .populate("reportingToUserId", "name email empCode");
  const byManager = new Map();
  for (const user of allUsers) {
    const managerId = user.reportingToUserId ? String(user.reportingToUserId._id || user.reportingToUserId) : "";
    if (!byManager.has(managerId)) byManager.set(managerId, []);
    byManager.get(managerId).push(user);
  }
  const queue = [String(root._id)];
  const result = [];
  const seen = new Set(queue);
  while (queue.length) {
    const managerId = queue.shift();
    const children = byManager.get(managerId) || [];
    for (const child of children) {
      const id = String(child._id);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(child);
      queue.push(id);
    }
  }
  return { root, descendants: result };
}

async function sendEmployeeCredentials(tenantId, userId, actor) {
  const user = await User.findOne({ _id: userId, tenantId });
  if (!user) {
    throw new ApiError(404, "Employee not found");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  user.passwordHash = passwordHash;
  user.status = "ACTIVE";
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const loginUrl = env.APP_PUBLIC_URL || "http://localhost:5173/login";
  const html = buildEmployeeCredsEmail({
    tenantName: tenant.name,
    name: user.name,
    email: user.email,
    password,
    empCode: user.empCode || "N/A",
    loginUrl,
  });

  try {
    await sendEmail({
      to: user.email,
      subject: `Approve.io — Your credentials for ${tenant.name}`,
      html,
    });
  } catch (err) {
    console.error("Failed to send employee credentials email:", err);
  }

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_CREDENTIALS_SENT",
    metadata: { targetUserId: userId, email: user.email },
  });

  return { success: true, email: user.email, name: user.name, password, empCode: user.empCode || "N/A" };
}

async function sendEmployeeCredentialsBulk(tenantId, userIds, actor) {
  const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    throw new ApiError(400, "No employees selected");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const users = await User.find({ _id: { $in: uniqueIds }, tenantId });
  if (!users.length) {
    throw new ApiError(404, "No matching employees found");
  }

  const loginUrl = env.APP_PUBLIC_URL || "http://localhost:5173/login";
  const results = [];

  for (const user of users) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    user.passwordHash = passwordHash;
    user.status = "ACTIVE";
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const html = buildEmployeeCredsEmail({
      tenantName: tenant.name,
      name: user.name,
      email: user.email,
      password,
      empCode: user.empCode || "N/A",
      loginUrl,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: `Approve.io — Your credentials for ${tenant.name}`,
        html,
      });
      results.push({ userId: user._id, email: user.email, name: user.name, password, empCode: user.empCode || "N/A", success: true });
    } catch (err) {
      console.error(`Failed to send credentials email to ${user.email}:`, err);
      results.push({ userId: user._id, email: user.email, name: user.name, password, empCode: user.empCode || "N/A", success: false, error: "Email send failed" });
    }
  }

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_CREDENTIALS_SENT_BULK",
    metadata: { userIds: uniqueIds, sentCount, failedCount },
  });

  return { sentCount, failedCount, results };
}

module.exports = {
  listUsers,
  updateUser,
  deleteUser,
  bulkAssignReporting,
  getUserSubtree,
  sendEmployeeCredentials,
  sendEmployeeCredentialsBulk,
};
