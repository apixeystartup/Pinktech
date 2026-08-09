const User = require("../models/user.model");

/**
 * Walk `reportingToUserId` from `startUserId` up to the root (CEO / no manager).
 * Returns ordered list of manager user ObjectIds as strings (immediate manager first).
 */
async function listManagersUpChain(tenantId, startUserId) {
  const chain = [];
  let current = startUserId ? String(startUserId) : null;
  const seen = new Set();

  while (current && !seen.has(current)) {
    seen.add(current);
    // eslint-disable-next-line no-await-in-loop
    const doc = await User.findOne({ tenantId, _id: current, orgLeftAt: null })
      .select("reportingToUserId")
      .lean();
    if (!doc?.reportingToUserId) break;
    const nextId = String(doc.reportingToUserId);
    chain.push(nextId);
    current = nextId;
  }

  return chain;
}

module.exports = {
  listManagersUpChain,
};
