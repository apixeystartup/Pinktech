const Role = require("../../models/role.model");
const User = require("../../models/user.model");
const Position = require("../../models/position.model");
const Permission = require("../../models/permission.model");
const ApiError = require("../../common/errors/ApiError");
const rolesService = require("../roles/roles.service");
const { runOrgRoleEngine } = require("../../services/orgRoleEngine.service");
const { syncPositionLevelsFromOrg } = require("../positions/positions.service");
const { writeAudit } = require("../../services/audit.service");

function viewRole(r) {
  const auto = r.auto || { level: 1, scope: "HQ", detectedAt: new Date() };
  return {
    id: String(r._id),
    name: r.name,
    aliases: r.aliases || [],
    auto: {
      level: auto.level,
      scope: auto.scope,
      detectedAt: auto.detectedAt,
    },
    override: r.override || {},
    effectiveLevel: Role.effectiveLevel(r),
    effectiveScope: Role.effectiveScope(r),
    employeeCount: r.employeeCount ?? 0,
  };
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

async function listOrgRoles(tenantId) {
  const roles = await Role.find({ tenantId }).sort({ name: 1 });
  return { roles: roles.map((r) => viewRole(r)) };
}

async function getOrgRole(tenantId, id) {
  const r = await Role.findOne({ tenantId, _id: id });
  if (!r) return null;
  return { role: viewRole(r) };
}

async function putOrgRole(tenantId, id, body, actor) {
  const patch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.aliases !== undefined) patch.aliases = body.aliases;
  if (body.override) {
    if (body.override.level !== undefined) patch.orgLevelOverride = body.override.level;
    if (body.override.scope !== undefined) patch.orgScopeOverride = body.override.scope;
  }
  if (body.clear_overrides) {
    patch.orgLevelOverride = null;
    patch.orgScopeOverride = null;
  }
  if (Object.keys(patch).length === 0) {
    const r = await Role.findOne({ tenantId, _id: id });
    if (!r) throw new ApiError(404, "Role not found");
    return { role: viewRole(r) };
  }
  const updated = await rolesService.updateRole(tenantId, id, patch, actor);
  return { role: viewRole(updated) };
}

async function resetOrgRole(tenantId, id, actor) {
  return putOrgRole(tenantId, id, { clear_overrides: true }, actor);
}

async function createOrgRole(tenantId, body, actor) {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Role name required");
  const all = await Permission.find({}, { _id: 1 });
  const permissionIds = pickRandomPermissions(all.map((p) => p._id));
  const aliases = body.aliases?.length
    ? [...new Set(body.aliases.map((a) => String(a).trim().toUpperCase()).filter(Boolean))]
    : [name.toUpperCase()];
  const role = await Role.create({
    tenantId,
    name,
    type: "CUSTOM",
    permissionIds,
    aliases,
    auto: { level: 1, scope: "HQ", detectedAt: new Date() },
    employeeCount: 0,
  });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_CREATED",
    metadata: { roleId: role._id },
  });
  await runOrgRoleEngine(tenantId);
  await syncPositionLevelsFromOrg(tenantId);
  return { role: viewRole(role) };
}

async function autoDetectRoles(tenantId, actor) {
  const summary = await runOrgRoleEngine(tenantId);
  await syncPositionLevelsFromOrg(tenantId);
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_AUTO_DETECT",
    metadata: summary,
  });
  return summary;
}

async function resetAllOrgRoles(tenantId, actor) {
  await runOrgRoleEngine(tenantId);
  await syncPositionLevelsFromOrg(tenantId);
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_RESET_ALL",
    metadata: { note: "recomputed from reporting graph" },
  });
  return { ok: true };
}

async function mergeOrgRoles(tenantId, fromId, intoId, actor) {
  if (String(fromId) === String(intoId)) throw new ApiError(400, "Cannot merge into self");
  const [src, dst] = await Promise.all([
    Role.findOne({ tenantId, _id: fromId }),
    Role.findOne({ tenantId, _id: intoId }),
  ]);
  if (!src || !dst) throw new ApiError(404, "Role not found");
  if (src.type === "SYSTEM") throw new ApiError(403, "Cannot merge system role");

  const seen = new Set((dst.aliases || []).map((a) => String(a).toUpperCase()));
  for (const a of src.aliases || []) {
    const u = String(a).toUpperCase();
    if (!seen.has(u)) {
      dst.aliases = [...(dst.aliases || []), u];
      seen.add(u);
    }
  }
  await dst.save();

  const dstPos = await Position.findOne({ tenantId, roleId: dst._id });
  const srcPos = await Position.findOne({ tenantId, roleId: src._id });
  if (srcPos) {
    if (dstPos) {
      await Position.deleteOne({ _id: srcPos._id, tenantId });
    } else {
      srcPos.roleId = dst._id;
      srcPos.title = dst.name;
      await srcPos.save();
    }
  }

  const users = await User.find({ tenantId, roleIds: src._id });
  for (const u of users) {
    const ids = u.roleIds.map((x) => String(x)).filter((id) => id !== String(src._id));
    if (!ids.includes(String(dst._id))) ids.push(String(dst._id));
    u.roleIds = ids;
    await u.save();
  }

  await Role.deleteOne({ _id: src._id, tenantId });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "ORG_ROLE_MERGED",
    metadata: { fromId: src._id, intoId: dst._id },
  });
  await runOrgRoleEngine(tenantId);
  await syncPositionLevelsFromOrg(tenantId);
  return { role: viewRole(dst) };
}

module.exports = {
  viewRole,
  listOrgRoles,
  getOrgRole,
  putOrgRole,
  resetOrgRole,
  createOrgRole,
  autoDetectRoles,
  resetAllOrgRoles,
  mergeOrgRoles,
};
