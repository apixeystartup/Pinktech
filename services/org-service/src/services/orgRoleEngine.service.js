const User = require("../models/user.model");
const Role = require("../models/role.model");
const { emptyGraph, addEdge, addNode, longestDepth } = require("../utils/topologyGraph");
const { norm } = require("../utils/orgNorm");
const { primaryOrgRoleId } = require("../utils/orgPrimaryRole");
const { isGeographicManagerRole, isNationalOrgScopeRole } = require("../utils/orgDesignationScopeHints");

const DESIGNATION_LEVELS = {
  GM: 5, SM: 5, ZBM: 4, RBM: 3, ABM: 2, BM: 1,
};

const DESIGNATION_TOKENS = {
  "GENERAL MANAGER": "GM", "SALES MANAGER": "SM",
  "ZONAL BUSINESS MANAGER": "ZBM", "REGIONAL BUSINESS MANAGER": "RBM",
  "DEPUTY REGIONAL BUSINESS MANAGER": "RBM",
  "AREA BUSINESS MANAGER": "ABM", "SENIOR AREA BUSINESS MANAGER": "ABM",
  "BUSINESS MANAGER": "BM", "TRAINEE BUSINESS MANAGER": "BM",
};

function tokenOfDesignation(name) {
  if (!name) return null;
  return DESIGNATION_TOKENS[name.trim().toUpperCase()] || null;
}

function levelOfDesignation(name) {
  const token = tokenOfDesignation(name);
  return token ? DESIGNATION_LEVELS[token] : null;
}

const SCOPE_THRESHOLDS = { allIndiaZoneRatio: 0.75 };

const SCOPE_ORDER = {
  HQ: 0,
  AREA: 1,
  REGION: 2,
  ZONE: 3,
  ALL_INDIA: 4,
};

function emptySpan() {
  return { zones: new Set(), regions: new Set(), states: new Set(), hqs: new Set() };
}

function collectSubtreeSpan(seedId, childrenByParent, userById) {
  const span = emptySpan();
  const stack = [seedId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const u = userById.get(id);
    if (!u) continue;
    if (u.zone) span.zones.add(norm(u.zone));
    if (u.region) span.regions.add(norm(u.region));
    if (u.state) span.states.add(norm(u.state));
    if (u.hq) span.hqs.add(norm(u.hq));
    for (const c of childrenByParent.get(id) || []) stack.push(c);
  }
  return span;
}

function classifySpan(span, totalZones) {
  const nz = span.zones.size;
  const nr = span.regions.size;
  const ns = span.states.size;
  const nh = span.hqs.size;
  if (totalZones > 0 && nz / totalZones >= SCOPE_THRESHOLDS.allIndiaZoneRatio) return "ALL_INDIA";
  if (nz > 1) return "ALL_INDIA";
  if (nz === 1 && nr > 1) return "ZONE";
  if (nr === 1 && ns > 1) return "REGION";
  if (ns === 1 && nh > 1) return "AREA";
  return "HQ";
}

function ensureRoleOrgDefaults(roleDoc) {
  const name = (roleDoc.name || "").trim();
  if (!roleDoc.aliases || !roleDoc.aliases.length) {
    roleDoc.aliases = name ? [name.toUpperCase()] : [];
  }
  if (!roleDoc.auto) {
    roleDoc.auto = { level: 1, scope: "HQ", detectedAt: new Date() };
  } else {
    if (roleDoc.auto.level === undefined || roleDoc.auto.level === null) roleDoc.auto.level = 1;
    if (!roleDoc.auto.scope) roleDoc.auto.scope = "HQ";
    if (!roleDoc.auto.detectedAt) roleDoc.auto.detectedAt = new Date();
  }
}

function inferLevelsFromGraph(roles, graph) {
  for (const r of roles) addNode(graph, String(r._id));

  const now = new Date();
  for (const role of roles) {
    ensureRoleOrgDefaults(role);
    const desigLevel = levelOfDesignation(role.name);
    if (desigLevel !== null) {
      role.auto.level = desigLevel;
      role.auto.detectedAt = now;
    }
  }

  const depth = longestDepth(graph);
  let maxDepth = 0;
  for (const d of depth.values()) {
    if (d > maxDepth) maxDepth = d;
  }
  for (const role of roles) {
    const desigLevel = levelOfDesignation(role.name);
    if (desigLevel !== null) continue;
    const id = String(role._id);
    const d = depth.get(id);
    if (d === undefined) continue;
    role.auto.level = maxDepth + 1 - d;
    role.auto.detectedAt = now;
  }
}

function inferScopeFromUsers(roles, users, graph) {
  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  const childrenByParent = new Map();
  const userById = new Map();
  for (const u of users) {
    userById.set(String(u._id), u);
    if (u.reportingToUserId) {
      const p = String(u.reportingToUserId);
      const arr = childrenByParent.get(p) || [];
      arr.push(String(u._id));
      childrenByParent.set(p, arr);
    }
  }

  const allZones = new Set();
  for (const u of users) {
    if (u.zone) allZones.add(norm(u.zone));
  }
  const totalZones = Math.max(1, allZones.size);

  const rootRoleIds = new Set();
  for (const r of roles) {
    const incoming = graph.incoming.get(String(r._id)) || new Set();
    if (incoming.size === 0) rootRoleIds.add(String(r._id));
  }

  const membersByRole = new Map();
  for (const u of users) {
    if (u.status === "DISABLED") continue;
    const rid = primaryOrgRoleId(u, roleById);
    if (!rid) continue;
    const k = String(rid);
    const arr = membersByRole.get(k) || [];
    arr.push(u);
    membersByRole.set(k, arr);
  }

  for (const role of roles) {
    ensureRoleOrgDefaults(role);
    const seeds = membersByRole.get(String(role._id)) || [];
    if (!seeds.length) {
      role.auto.scope = "HQ";
      continue;
    }

    let pool = seeds.filter((u) => !u.orgSeatVacant);
    if (!pool.length) pool = [...seeds];
    const withReports = pool.filter((u) => (childrenByParent.get(String(u._id)) || []).length > 0);
    if (withReports.length) pool = withReports;

    const votes = new Map();
    for (const u of pool) {
      const span = collectSubtreeSpan(String(u._id), childrenByParent, userById);
      const cls = classifySpan(span, totalZones);
      votes.set(cls, (votes.get(cls) || 0) + 1);
    }

    let winner = "HQ";
    let bestVotes = -1;
    let bestOrder = -1;
    for (const [scope, count] of votes) {
      const order = SCOPE_ORDER[scope] ?? 0;
      if (count > bestVotes || (count === bestVotes && order > bestOrder)) {
        winner = scope;
        bestVotes = count;
        bestOrder = order;
      }
    }
    if (rootRoleIds.has(String(role._id)) && !isGeographicManagerRole(role)) {
      winner = "ALL_INDIA";
    }
    role.auto.scope = winner;
    if (isNationalOrgScopeRole(role)) {
      role.auto.scope = "ALL_INDIA";
    }
  }
}

function countEmployeesByRole(users, roleById) {
  const counts = new Map();
  for (const u of users) {
    if (u.status === "DISABLED") continue;
    const k = primaryOrgRoleId(u, roleById);
    if (!k) continue;
    counts.set(String(k), (counts.get(String(k)) || 0) + 1);
  }
  return counts;
}

async function runOrgRoleEngine(tenantId) {
  const [users, roles] = await Promise.all([
    User.find({ tenantId, orgFromWorkbook: true })
      .select("roleIds reportingToUserId status zone region state hq orgSeatVacant designationOverride")
      .lean(),
    Role.find({ tenantId, type: { $ne: "SYSTEM" } }),
  ]);

  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  const graph = emptyGraph();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  for (const u of users) {
    if (u.status === "DISABLED") continue;
    const subRole = primaryOrgRoleId(u, roleById);
    if (!subRole || !u.reportingToUserId) continue;
    const mgr = userById.get(String(u.reportingToUserId));
    if (!mgr || mgr.status === "DISABLED") continue;
    const mgrRole = primaryOrgRoleId(mgr, roleById);
    if (!mgrRole || String(mgrRole) === String(subRole)) continue;
    addEdge(graph, String(mgrRole), String(subRole));
  }

  inferLevelsFromGraph(roles, graph);
  inferScopeFromUsers(roles, users, graph);

  const empCounts = countEmployeesByRole(users, roleById);
  const now = new Date();

  for (const role of roles) {
    ensureRoleOrgDefaults(role);
    const upper = (role.name || "").trim().toUpperCase();
    if (upper && !(role.aliases || []).includes(upper)) {
      role.aliases = [...(role.aliases || []), upper];
    }
    role.employeeCount = empCounts.get(String(role._id)) || 0;
    role.auto.detectedAt = now;
    await role.save();
  }

  const maxLevel = roles.reduce((m, r) => Math.max(m, Role.effectiveLevel(r)), 0);
  const scopes = { ALL_INDIA: 0, ZONE: 0, REGION: 0, AREA: 0, HQ: 0 };
  for (const r of roles) {
    scopes[Role.effectiveScope(r)] += 1;
  }

  return {
    roles: roles.length,
    maxLevel,
    scopes,
  };
}

module.exports = {
  runOrgRoleEngine,
  primaryOrgRoleId,
};
