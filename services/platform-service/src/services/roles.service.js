const Role = require("../models/role.model");
const Permission = require("../models/permission.model");
const ApiError = require("@pink/shared").ApiError;
const { writeAudit } = require("./audit.service");

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
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_ENGINE_RUN",
    metadata: { message: "Org role engine not available in platform-service" },
  });
  return { message: "Org role engine not available in platform-service" };
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
