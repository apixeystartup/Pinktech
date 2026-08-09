const Position = require("../../models/position.model");

async function getSubtreePositionIds(tenantId, rootPositionId) {
  if (!rootPositionId) {
    return [];
  }

  const positions = await Position.find({ tenantId, status: "ACTIVE" }).lean();
  const childrenByParent = new Map();

  for (const position of positions) {
    const parentKey = position.parentPositionId ? String(position.parentPositionId) : "root";
    const list = childrenByParent.get(parentKey) || [];
    list.push(String(position._id));
    childrenByParent.set(parentKey, list);
  }

  const root = String(rootPositionId);
  const result = new Set([root]);
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    const children = childrenByParent.get(current) || [];
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }

  return [...result];
}

module.exports = {
  getSubtreePositionIds,
};
