const User = require("../models/user.model");

async function listManagersUpChain(tenantId, startUserId) {
  const chain = [];
  let current = startUserId ? String(startUserId) : null;
  const seen = new Set();

  while (current && !seen.has(current)) {
    seen.add(current);
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
