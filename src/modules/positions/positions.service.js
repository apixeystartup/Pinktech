const Position = require("../../models/position.model");
const User = require("../../models/user.model");
const Assignment = require("../../models/assignment.model");
const Role = require("../../models/role.model");
const ApiError = require("../../common/errors/ApiError");
const { writeAudit } = require("../../services/audit.service");
const { getSubtreePositionIds } = require("./hierarchy.service");

async function createPosition(tenantId, payload, actor) {
  const role = await Role.findOne({ _id: payload.roleId, tenantId });
  if (!role) {
    throw new ApiError(404, "Role not found");
  }
  if (payload.parentPositionId) {
    const parent = await Position.findOne({ _id: payload.parentPositionId, tenantId, status: "ACTIVE" });
    if (!parent) {
      throw new ApiError(404, "Parent position not found");
    }
  }
  const existingRolePosition = await Position.findOne({ tenantId, roleId: payload.roleId });
  if (existingRolePosition) {
    throw new ApiError(409, "Position already exists for this role");
  }
  const position = await Position.create({
    tenantId,
    roleId: payload.roleId,
    title: role.name,
    levelName: payload.levelName,
    parentPositionId: payload.parentPositionId || null,
  });
  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "POSITION_CREATED",
    metadata: { positionId: position._id },
  });
  return position;
}

async function listPositions(tenantId) {
  return Position.find({ tenantId }).populate("roleId", "name").populate("parentPositionId").sort({ createdAt: 1 });
}

async function updatePosition(tenantId, positionId, payload, actor) {
  if (payload.parentPositionId && String(payload.parentPositionId) === String(positionId)) {
    throw new ApiError(400, "Position cannot be parent of itself");
  }

  const update = { ...payload };
  if (payload.roleId) {
    const role = await Role.findOne({ _id: payload.roleId, tenantId });
    if (!role) {
      throw new ApiError(404, "Role not found");
    }
    update.title = role.name;
  }
  const position = await Position.findOneAndUpdate({ _id: positionId, tenantId }, update, {
    returnDocument: "after",
  })
    .populate("roleId", "name")
    .populate("parentPositionId");
  if (!position) {
    throw new ApiError(404, "Position not found");
  }

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "POSITION_UPDATED",
    metadata: { positionId },
  });
  return position;
}

async function getSubtree(tenantId, positionId) {
  const ids = await getSubtreePositionIds(tenantId, positionId);
  return Position.find({ _id: { $in: ids }, tenantId });
}

async function deletePositions(tenantId, positionIds, actor) {
  const uniqueIds = [...new Set((positionIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    throw new ApiError(400, "No positions selected");
  }

  const existing = await Position.find({ tenantId, _id: { $in: uniqueIds } }, { _id: 1 });
  const existingIds = new Set(existing.map((p) => String(p._id)));
  const missing = uniqueIds.filter((id) => !existingIds.has(id));
  if (missing.length) {
    throw new ApiError(404, "Some selected positions were not found");
  }

  await Position.deleteMany({ tenantId, _id: { $in: uniqueIds } });
  await User.updateMany(
    { tenantId, currentPositionId: { $in: uniqueIds } },
    { $set: { currentPositionId: null } },
  );
  await Assignment.updateMany(
    { tenantId, positionId: { $in: uniqueIds }, isCurrent: true },
    { $set: { isCurrent: false, activeTo: new Date() } },
  );

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "POSITION_DELETED_BULK",
    metadata: { count: uniqueIds.length, positionIds: uniqueIds },
  });

  return { deletedCount: uniqueIds.length };
}

/**
 * After org role engine run, align each position's levelName with the numeric org level
 * of its role (display: "Level N").
 */
async function syncPositionLevelsFromOrg(tenantId) {
  const positions = await Position.find({ tenantId }).populate("roleId");
  for (const pos of positions) {
    const r = pos.roleId;
    if (!r) continue;
    const lvl = Role.effectiveLevel(r);
    pos.levelName = `Level ${lvl}`;
    await pos.save();
  }
}

module.exports = {
  createPosition,
  listPositions,
  updatePosition,
  getSubtree,
  deletePositions,
  syncPositionLevelsFromOrg,
};
