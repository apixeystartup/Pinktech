const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/user.model");
const ApiError = require("@pink/shared").ApiError;
const { writeAudit } = require("../services/audit.service");
const notificationAdapter = require("./notification.adapter");

async function listUsers(tenantId, options = {}) {
  const roleId = options.roleId ? String(options.roleId).trim() : "";
  const showAll = options.showAll === true;
  const query = { tenantId };
  if (!showAll) {
    query.orgFromWorkbook = { $ne: true };
  }
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

async function sendCredentials(tenantId, userId, actor) {
  const user = await User.findOne({ _id: userId, tenantId });
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  const tempPassword = "Emp@" + crypto.randomBytes(3).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  user.passwordHash = passwordHash;
  user.status = "ACTIVE";
  await user.save();

  if (user.email) {
    try {
      await notificationAdapter.sendEmail({
        to: user.email,
        subject: "Your login credentials",
        html: `Hi ${user.name || "there"}, your account is ready. Email: ${user.email}, Password: ${tempPassword}`,
        templateParams: {
          to_email: user.email,
          subject: "Your login credentials",
          name: user.name || "",
          email: user.email,
          tempPassword,
        },
      });
    } catch (emailErr) {
      console.error("Failed to send credentials email:", emailErr.message);
    }
  }

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_CREDENTIALS_SENT",
    metadata: { targetUserId: userId, email: user.email },
  });

  return { email: user.email, tempPassword };
}

async function resetCredentials(tenantId, userId, actor) {
  return sendCredentials(tenantId, userId, actor);
}

module.exports = {
  listUsers,
  updateUser,
  deleteUser,
  bulkAssignReporting,
  getUserSubtree,
  sendCredentials,
  resetCredentials,
};
