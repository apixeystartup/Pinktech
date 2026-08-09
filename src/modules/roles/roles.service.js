const Role = require("../../models/role.model");
const Permission = require("../../models/permission.model");
const Position = require("../../models/position.model");
const User = require("../../models/user.model");
const ApiError = require("../../common/errors/ApiError");
const { writeAudit } = require("../../services/audit.service");
const { runOrgRoleEngine } = require("../../services/orgRoleEngine.service");
const { syncPositionLevelsFromOrg } = require("../positions/positions.service");

async function resolvePermissionIds(payload) {
  const ids = new Set();
  if (payload.permissionIds?.length) {
    for (const id of payload.permissionIds) {
      ids.add(String(id));
    }
  }
  if (payload.permissionCodes?.length) {
    const found = await Permission.find({ code: { $in: payload.permissionCodes } });
    const foundCodes = new Set(found.map((p) => p.code));
    const missing = payload.permissionCodes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new ApiError(400, `Unknown permission codes: ${missing.join(", ")}`);
    }
    for (const p of found) {
      ids.add(String(p._id));
    }
  }
  const list = [...ids];
  if (!list.length) {
    throw new ApiError(400, "Select at least one permission");
  }
  return list;
}

async function createRole(tenantId, payload, actor) {
  const existing = await Role.findOne({ tenantId, name: payload.name.trim() });
  if (existing) {
    throw new ApiError(409, "Role already exists");
  }

  const permissionIds = await resolvePermissionIds({
    permissionIds: payload.permissionIds,
    permissionCodes: payload.permissionCodes,
  });

  const nameTrim = payload.name.trim();
  const role = await Role.create({
    tenantId,
    name: nameTrim,
    type: payload.type || "CUSTOM",
    permissionIds,
    aliases: [nameTrim.toUpperCase()],
    auto: { level: 1, scope: "HQ", detectedAt: new Date() },
    employeeCount: 0,
  });

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ROLE_CREATED",
    metadata: { roleId: role._id },
  });

  return Role.findById(role._id).populate("permissionIds");
}

async function listRoles(tenantId) {
  return Role.find({ tenantId }).populate("permissionIds");
}

async function updateRole(tenantId, roleId, payload, actor) {
  const role = await Role.findOne({ _id: roleId, tenantId });
  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (payload.name !== undefined) {
    role.name = String(payload.name).trim();
    const upper = role.name.toUpperCase();
    if (upper && !(role.aliases || []).includes(upper)) {
      role.aliases = [...(role.aliases || []), upper];
    }
  }
  if (payload.permissionIds !== undefined || payload.permissionCodes !== undefined) {
    role.permissionIds = await resolvePermissionIds({
      permissionIds: payload.permissionIds || [],
      permissionCodes: payload.permissionCodes || [],
    });
  }
  if (payload.aliases !== undefined) {
    role.aliases = [...new Set((payload.aliases || []).map((a) => String(a).trim().toUpperCase()).filter(Boolean))];
  }
  if (payload.orgLevelOverride !== undefined) {
    if (!role.override) role.override = {};
    if (payload.orgLevelOverride === null) {
      delete role.override.level;
    } else {
      role.override.level = payload.orgLevelOverride;
    }
  }
  if (payload.orgScopeOverride !== undefined) {
    if (!role.override) role.override = {};
    if (payload.orgScopeOverride === null) {
      delete role.override.scope;
    } else {
      role.override.scope = payload.orgScopeOverride;
    }
  }

  await role.save();

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ROLE_UPDATED",
    metadata: { roleId: role._id },
  });
  return Role.findById(role._id).populate("permissionIds");
}

async function recomputeOrgChart(tenantId, actor) {
  const summary = await runOrgRoleEngine(tenantId);
  await syncPositionLevelsFromOrg(tenantId);
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_ENGINE_RUN",
    metadata: summary,
  });
  return summary;
}

async function deleteRole(tenantId, roleId, actor) {
  const role = await Role.findOne({ _id: roleId, tenantId });
  if (!role) {
    throw new ApiError(404, "Role not found");
  }
  if (role.type === "SYSTEM") {
    throw new ApiError(403, "System roles cannot be deleted");
  }
  await Role.deleteOne({ _id: roleId, tenantId });
  await Position.deleteMany({ tenantId, roleId });
  await User.updateMany({ tenantId }, { $pull: { roleIds: role._id } });
  await User.updateMany({ tenantId, roleIds: { $size: 0 } }, { $set: { reportingToUserId: null } });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ROLE_DELETED",
    metadata: { roleId: role._id },
  });
}

async function bulkDeleteRoles(tenantId, roleIds, actor) {
  const uniqueRoleIds = [...new Set((roleIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueRoleIds.length) {
    throw new ApiError(400, "No roles selected");
  }
  const roles = await Role.find({ tenantId, _id: { $in: uniqueRoleIds } });
  const systemRole = roles.find((r) => r.type === "SYSTEM");
  if (systemRole) {
    throw new ApiError(403, "System roles cannot be deleted");
  }
  await Role.deleteMany({ tenantId, _id: { $in: uniqueRoleIds } });
  await Position.deleteMany({ tenantId, roleId: { $in: uniqueRoleIds } });
  await User.updateMany({ tenantId }, { $pull: { roleIds: { $in: uniqueRoleIds } } });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ROLE_DELETED_BULK",
    metadata: { count: uniqueRoleIds.length, roleIds: uniqueRoleIds },
  });
  return { deletedCount: uniqueRoleIds.length };
}

module.exports = {
  createRole,
  listRoles,
  updateRole,
  deleteRole,
  bulkDeleteRoles,
  recomputeOrgChart,
};
