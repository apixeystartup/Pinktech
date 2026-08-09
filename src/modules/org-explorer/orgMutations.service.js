const mongoose = require("mongoose");
const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const Permission = require("../../models/permission.model");
const ApiError = require("../../common/errors/ApiError");
const { writeAudit } = require("../../services/audit.service");
const { loadSnapshot, findInSnapshot, enrich, userToPosition } = require("./orgDirectory.service");
const { runOrgRoleEngine } = require("../../services/orgRoleEngine.service");
const { syncPositionLevelsFromOrg } = require("../positions/positions.service");

async function wouldCreateCycle(tenantId, subjectId, managerId) {
  if (!managerId) return false;
  if (String(managerId) === String(subjectId)) return true;
  const seen = new Set();
  let current = String(managerId);
  while (current && !seen.has(current)) {
    if (current === String(subjectId)) return true;
    seen.add(current);
    const doc = await User.findOne({ tenantId, _id: current }).select("reportingToUserId").lean();
    if (!doc || !doc.reportingToUserId) break;
    current = String(doc.reportingToUserId);
  }
  return false;
}

async function refreshOrgEngine(tenantId) {
  try {
    await runOrgRoleEngine(tenantId);
    await syncPositionLevelsFromOrg(tenantId);
  } catch (e) {
    console.error("org engine refresh failed", e);
  }
}

async function setManager(tenantId, subjectId, managerId, actor) {
  if (await wouldCreateCycle(tenantId, subjectId, managerId)) {
    throw new ApiError(400, "Invalid reporting line (cycle)");
  }
  const user = await User.findOneAndUpdate(
    { tenantId, _id: subjectId, orgLeftAt: null },
    { $set: { reportingToUserId: managerId || null } },
    { new: true },
  )
    .populate("roleIds")
    .populate("reportingToUserId", "name empCode email");
  if (!user) throw new ApiError(404, "Employee not found");
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_SET_MANAGER",
    metadata: { subjectId, managerId },
  });
  await refreshOrgEngine(tenantId);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, userToPosition(user, snap.roleById));
}

async function setRole(tenantId, subjectId, roleId, actor) {
  const role = await Role.findOne({ _id: roleId, tenantId });
  if (!role) throw new ApiError(404, "Role not found");
  const user = await User.findOneAndUpdate(
    { tenantId, _id: subjectId, orgLeftAt: null },
    { $set: { roleIds: [roleId] } },
    { new: true },
  )
    .populate("roleIds")
    .populate("reportingToUserId", "name empCode email");
  if (!user) throw new ApiError(404, "Employee not found");
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_SET_ROLE",
    metadata: { subjectId, roleId },
  });
  await refreshOrgEngine(tenantId);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, userToPosition(user, snap.roleById));
}

async function putEmployee(tenantId, subjectId, body, actor) {
  let last = null;
  if (body.manager_id !== undefined) {
    last = await setManager(tenantId, subjectId, body.manager_id || null, actor);
  }
  if (body.role_id !== undefined) {
    last = await setRole(tenantId, subjectId, body.role_id, actor);
  }
  if (body.contact_email !== undefined) {
    const raw = body.contact_email;
    let contact = null;
    if (raw !== null && raw !== "") {
      contact = String(raw).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        throw new ApiError(422, "Invalid contact_email");
      }
    }
    const user = await User.findOneAndUpdate(
      { tenantId, _id: subjectId, orgLeftAt: null },
      { $set: { orgContactEmail: contact } },
      { new: true },
    )
      .populate("roleIds")
      .populate("reportingToUserId", "name empCode email");
    if (!user) throw new ApiError(404, "Employee not found");
    await writeAudit({
      tenantId,
      userId: actor?.userId || null,
      action: "ORG_SET_CONTACT_EMAIL",
      metadata: { subjectId, orgContactEmail: contact },
    });
    await refreshOrgEngine(tenantId);
    const snap = await loadSnapshot(tenantId);
    last = enrich(snap, userToPosition(user, snap.roleById));
  }
  if (!last) {
    const snap = await loadSnapshot(tenantId);
    const p = findInSnapshot(snap, subjectId);
    if (!p) throw new ApiError(404, "Employee not found");
    last = enrich(snap, p);
  }
  return last;
}

async function markLeft(tenantId, subjectId, reassignTo, actor) {
  const subject = await User.findOne({ tenantId, _id: subjectId, orgLeftAt: null });
  if (!subject) throw new ApiError(404, "Employee not found");

  const directReports = await User.find({
    tenantId,
    reportingToUserId: subjectId,
    orgLeftAt: null,
  }).select("_id");

  const newMgr = reassignTo || null;
  if (newMgr) {
    const exists = await User.findOne({ tenantId, _id: newMgr, orgLeftAt: null });
    if (!exists) throw new ApiError(404, "Reassign target not found");
  }

  for (const r of directReports) {
    await User.updateOne({ _id: r._id, tenantId }, { $set: { reportingToUserId: newMgr } });
  }

  await User.updateOne(
    { _id: subjectId, tenantId },
    { $set: { orgLeftAt: new Date(), reportingToUserId: null, status: "DISABLED" } },
  );

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_MARK_LEFT",
    metadata: { subjectId, reassignTo: newMgr, reportsMoved: directReports.length },
  });
  await refreshOrgEngine(tenantId);
  return { ok: true, reports_reassigned: directReports.length };
}

async function restoreEmployee(tenantId, subjectId, actor) {
  const user = await User.findOneAndUpdate(
    { tenantId, _id: subjectId, orgLeftAt: { $ne: null } },
    { $set: { orgLeftAt: null, status: "ACTIVE" } },
    { new: true },
  )
    .populate("roleIds")
    .populate("reportingToUserId", "name empCode email");
  if (!user) throw new ApiError(404, "Left employee not found");
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_RESTORE",
    metadata: { subjectId },
  });
  await refreshOrgEngine(tenantId);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, userToPosition(user, snap.roleById));
}

async function reassignReports(tenantId, fromId, toId, reportIds, actor) {
  const q = { tenantId, reportingToUserId: fromId, orgLeftAt: null };
  if (reportIds?.length) q._id = { $in: reportIds };
  const targets = await User.find(q).select("_id");
  for (const t of targets) {
    if (toId && (await wouldCreateCycle(tenantId, String(t._id), toId))) {
      throw new ApiError(400, "Invalid reporting line (cycle)");
    }
  }
  await User.updateMany(q, { $set: { reportingToUserId: toId || null } });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_REASSIGN_REPORTS",
    metadata: { fromId, toId, count: targets.length },
  });
  await refreshOrgEngine(tenantId);
  return { moved: targets.length };
}

function pickRandomPermissions(permissionIds) {
  const shuffled = [...permissionIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = Math.max(1, Math.ceil(shuffled.length * 0.4));
  return shuffled.slice(0, count);
}

async function ensureDesignationRole(tenantId, designation) {
  const name = String(designation || "").trim() || "Staff";
  let role = await Role.findOne({ tenantId, name });
  if (role) return role;
  const all = await Permission.find({}, { _id: 1 });
  const permissionIds = pickRandomPermissions(all.map((p) => p._id));
  role = await Role.create({
    tenantId,
    name,
    type: "CUSTOM",
    permissionIds,
    aliases: [name.toUpperCase()],
    auto: { level: 1, scope: "HQ", detectedAt: new Date() },
    employeeCount: 0,
  });
  return role;
}

async function addEmployee(tenantId, payload, actor) {
  const name = String(payload.name || "").trim();
  if (!name) throw new ApiError(400, "Name is required");

  let roleId = payload.role_id || null;
  if (!roleId && payload.designation) {
    const r = await ensureDesignationRole(tenantId, payload.designation);
    roleId = r._id;
  }
  if (!roleId) throw new ApiError(400, "role_id or designation is required");

  const empId = payload.emp_id ? String(payload.emp_id).trim() : "";
  const rawContact = payload.contact_email || payload.email || null;
  let email;
  if (rawContact) {
    const normalized = String(rawContact).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new ApiError(422, "Invalid email");
    }
    const dup = await User.findOne({ tenantId, email: normalized }).select("_id").lean();
    if (dup) {
      throw new ApiError(409, "That email is already used in this organization");
    }
    email = normalized;
  } else {
    email = `org+${new mongoose.Types.ObjectId().toString()}@tenant.pink.local`.toLowerCase();
  }

  const managerId = payload.manager_id || null;
  if (managerId) {
    const mgr = await User.findOne({ tenantId, _id: managerId, orgLeftAt: null });
    if (!mgr) throw new ApiError(404, "Manager not found");
  }

  const user = await User.create({
    tenantId,
    name,
    email,
    orgContactEmail: rawContact ? email : null,
    empCode: empId || null,
    status: "INVITED",
    roleIds: [roleId],
    reportingToUserId: managerId,
    zone: payload.zone || null,
    region: payload.region || null,
    state: payload.state || null,
    hq: payload.hq || null,
    designationOverride: payload.designation && !payload.role_id ? String(payload.designation).trim() : null,
  });

  const populated = await User.findById(user._id).populate("roleIds").populate("reportingToUserId", "name empCode email");
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ADD_EMPLOYEE",
    metadata: { userId: user._id },
  });
  await refreshOrgEngine(tenantId);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, userToPosition(populated, snap.roleById));
}

async function replacePerson(tenantId, subjectId, payload, actor) {
  const old = await User.findOne({ tenantId, _id: subjectId });
  if (!old) throw new ApiError(404, "Employee not found");
  const mgr = old.reportingToUserId ? String(old.reportingToUserId) : null;
  await markLeft(tenantId, subjectId, mgr, actor);
  const created = await addEmployee(
    tenantId,
    {
      ...payload,
      manager_id: payload.manager_id || mgr,
    },
    actor,
  );
  return created;
}

async function removedPeople(tenantId) {
  const users = await User.find({ tenantId, orgLeftAt: { $ne: null } })
    .populate("roleIds")
    .sort({ orgLeftAt: -1 })
    .limit(500);

  return users.map((u) => {
    const roleById = new Map();
    for (const r of u.roleIds || []) {
      if (r && typeof r === "object" && r._id) roleById.set(String(r._id), r);
    }
    const p = userToPosition(u, roleById);
    const pr = p.roleId ? roleById.get(String(p.roleId)) : null;
    const roleName = pr?.name || null;
    return {
      id: String(u._id),
      emp_id: u.empCode,
      name: u.name,
      designation: u.designationOverride || roleName,
      role_name: roleName,
      hq: u.hq,
      zone: u.zone,
      region: u.region,
      state: u.state,
      last_manager_name: null,
      direct_reports: 0,
      left_at: u.orgLeftAt?.toISOString?.() || String(u.orgLeftAt),
    };
  });
}

async function resetHierarchy(tenantId, actor) {
  await User.updateMany({ tenantId, orgLeftAt: null }, { $set: { reportingToUserId: null } });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_HIERARCHY_RESET",
    metadata: {},
  });
  await refreshOrgEngine(tenantId);
  return { ok: true };
}

module.exports = {
  setManager,
  setRole,
  putEmployee,
  markLeft,
  restoreEmployee,
  reassignReports,
  addEmployee,
  replacePerson,
  removedPeople,
  resetHierarchy,
  refreshOrgEngine,
};
