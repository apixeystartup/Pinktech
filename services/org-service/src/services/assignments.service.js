const mongoose = require("mongoose");
const Assignment = require("../models/assignment.model");
const Position = require("../models/position.model");
const User = require("../models/user.model");
const ApiError = require("@pink/shared").ApiError;
const { writeAudit } = require("./audit.service");

async function assignSeat(tenantId, payload, actor) {
  const user = await User.findOne({ _id: payload.userId, tenantId });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const position = await Position.findOne({ _id: payload.positionId, tenantId, status: "ACTIVE" });
  if (!position) {
    throw new ApiError(404, "Position not found");
  }

  await Assignment.updateMany(
    { tenantId, userId: payload.userId, isCurrent: true },
    { $set: { isCurrent: false, activeTo: new Date() } }
  );

  await Assignment.updateMany(
    { tenantId, positionId: payload.positionId, isCurrent: true },
    { $set: { isCurrent: false, activeTo: new Date() } }
  );

  const assignment = await Assignment.create({
    tenantId,
    userId: payload.userId,
    positionId: payload.positionId,
    activeFrom: payload.activeFrom || new Date(),
    isCurrent: true,
  });

  await User.updateOne({ _id: payload.userId }, { $set: { currentPositionId: payload.positionId } });

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "SEAT_ASSIGNED",
    metadata: {
      assignmentId: assignment._id,
      userId: payload.userId,
      positionId: payload.positionId,
    },
  });

  return assignment;
}

async function replaceUserCurrentAssignment(tenantId, userId, positionId) {
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(positionId)) {
    return null;
  }
  const position = await Position.findOne({ _id: positionId, tenantId, status: "ACTIVE" });
  if (!position) {
    return null;
  }
  await Assignment.updateMany(
    { tenantId, userId, isCurrent: true },
    { $set: { isCurrent: false, activeTo: new Date() } }
  );
  const assignment = await Assignment.create({
    tenantId,
    userId,
    positionId,
    activeFrom: new Date(),
    isCurrent: true,
  });
  await User.updateOne({ _id: userId, tenantId }, { $set: { currentPositionId: positionId } });
  return assignment;
}

async function listAssignments(tenantId, query) {
  const filter = { tenantId };
  if (query.positionId) {
    filter.positionId = query.positionId;
  }
  if (query.userId) {
    filter.userId = query.userId;
  }
  if (typeof query.isCurrent !== "undefined") {
    filter.isCurrent = query.isCurrent === "true";
  }
  return Assignment.find(filter).sort({ createdAt: -1 }).populate("userId positionId");
}

module.exports = {
  assignSeat,
  listAssignments,
  replaceUserCurrentAssignment,
};
