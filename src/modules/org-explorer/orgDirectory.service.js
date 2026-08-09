/**
 * Org directory snapshot + read APIs — mirrors test/server employee.service
 * but backed by Pink User + Role (reportingToUserId, roleIds[0] as primary org role).
 */

const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const { norm } = require("../../utils/orgNorm");
const { primaryOrgRoleId } = require("../../utils/orgPrimaryRole");

const PLACEHOLDER_RE = /^\s*VACANT\s+([A-Z]+)\s+REPORT\s+TO\s+([A-Z]+)\s*$/i;
const GEO_FIELDS = ["zone", "region", "state", "hq"];

function userToPosition(u, roleById) {
  const rid = primaryOrgRoleId(u, roleById);
  const roleId = rid || null;
  const primaryRole = rid ? roleById.get(rid) || null : null;
  const mgr = u.reportingToUserId;
  const mgrId = mgr?._id || mgr || null;
  return {
    _id: u._id,
    empId: u.empCode || null,
    name: u.name,
    designation: u.designationOverride || primaryRole?.name || null,
    roleId,
    hq: u.hq || null,
    zone: u.zone || null,
    region: u.region || null,
    state: u.state || null,
    doj: u.doj || null,
    dob: u.dob || null,
    gender: u.gender || null,
    isVacant: !!u.orgSeatVacant,
    addedManually: false,
    parentPositionId: mgrId ? String(mgrId) : null,
    managerResolution: u.managerResolution || (mgrId ? "linked" : "root"),
    reportingManagerRaw: u.reportingManagerRaw || null,
    sno: u.orgSno ?? null,
    email: u.email || null,
    orgContactEmail: u.orgContactEmail || null,
  };
}

async function loadSnapshot(tenantId) {
  const Permission = require("../../models/permission.model");
  const tenantMgmtPerm = await Permission.findOne({ code: "tenant.manage" }).lean();
  const adminPermId = tenantMgmtPerm ? String(tenantMgmtPerm._id) : null;

  const allRoles = await Role.find({ tenantId }).lean();
  const adminRoleIds = new Set();
  if (adminPermId) {
    for (const r of allRoles) {
      const ids = (r.permissionIds || []).map(String);
      if (ids.includes(adminPermId)) {
        adminRoleIds.add(String(r._id));
      }
    }
  }

  const users = await User.find({
    tenantId,
    orgLeftAt: null,
    status: { $in: ["ACTIVE", "INVITED", "OTP_PENDING"] },
    ...(adminRoleIds.size
      ? { roleIds: { $not: { $elemMatch: { $in: [...adminRoleIds] } } } }
      : {}),
  })
    .populate("roleIds")
    .populate("reportingToUserId", "name email empCode")
    .sort({ name: 1 });

  const roles = allRoles.filter((r) => !adminRoleIds.has(String(r._id)));

  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  let maxLevel = 1;
  for (const r of roles) {
    const lv = Role.effectiveLevel(r);
    if (lv > maxLevel) maxLevel = lv;
  }

  const positions = users.map((u) => userToPosition(u, roleById));
  const byId = new Map();
  const byEmpId = new Map();
  const childrenByParent = new Map();

  for (const p of positions) {
    const id = String(p._id);
    byId.set(id, p);
    if (p.empId) byEmpId.set(String(p.empId).trim().toUpperCase(), p);
    const parentKey = p.parentPositionId ? String(p.parentPositionId) : "__root__";
    const arr = childrenByParent.get(parentKey) || [];
    arr.push(id);
    childrenByParent.set(parentKey, arr);
  }

  for (const [k, ids] of childrenByParent.entries()) {
    ids.sort((a, b) => {
      const A = byId.get(a);
      const B = byId.get(b);
      const av = A?.isVacant ? 1 : 0;
      const bv = B?.isVacant ? 1 : 0;
      if (av !== bv) return av - bv;
      return (A?.name || "").localeCompare(B?.name || "");
    });
    childrenByParent.set(k, ids);
  }

  return {
    tenantId,
    positions,
    byId,
    byEmpId,
    childrenByParent,
    roleById,
    maxLevel,
  };
}

function findInSnapshot(snap, key) {
  if (!key) return null;
  const k = String(key).trim();
  const direct = snap.byId.get(k);
  if (direct) return direct;
  const byEmp = snap.byEmpId.get(k.toUpperCase());
  if (byEmp) return byEmp;
  const target = k.toLowerCase();
  for (const p of snap.positions) {
    if ((p.name || "").toLowerCase() === target) return p;
  }
  return null;
}

function levelOf(snap, p) {
  if (!p.roleId) return 1;
  const r = snap.roleById.get(String(p.roleId));
  return r ? Role.effectiveLevel(r) : 1;
}

function scopeOf(snap, p) {
  if (!p.roleId) return "HQ";
  const r = snap.roleById.get(String(p.roleId));
  return r ? Role.effectiveScope(r) : "HQ";
}

function enrich(snap, p) {
  const role = p.roleId ? snap.roleById.get(String(p.roleId)) || null : null;
  const manager = p.parentPositionId ? snap.byId.get(String(p.parentPositionId)) || null : null;
  const childrenIds = snap.childrenByParent.get(String(p._id)) || [];
  const externalManager =
    !manager &&
    p.reportingManagerRaw &&
    !PLACEHOLDER_RE.test(p.reportingManagerRaw) &&
    p.managerResolution === "external_root"
      ? p.reportingManagerRaw
      : null;

  const mgrRole = manager?.roleId ? snap.roleById.get(String(manager.roleId)) : null;

  return {
    id: String(p._id),
    emp_id: p.empId,
    name: p.name,
    designation: p.designation,
    role_id: role ? String(role._id) : null,
    role_name: role ? role.name : p.designation || "Unspecified",
    level: role ? Role.effectiveLevel(role) : 1,
    scope: role ? Role.effectiveScope(role) : "HQ",
    hq: p.hq,
    zone: p.zone,
    region: p.region,
    state: p.state,
    doj: p.doj,
    dob: p.dob,
    gender: p.gender,
    is_vacant: p.isVacant,
    added_manually: p.addedManually,
    manager_id: p.parentPositionId ? String(p.parentPositionId) : null,
    manager_resolution: p.managerResolution,
    reporting_manager_raw: p.reportingManagerRaw,
    external_manager: externalManager,
    direct_reports: childrenIds.length,
    manager: manager
      ? {
          id: String(manager._id),
          name: manager.name,
          emp_id: manager.empId,
          designation: manager.designation,
          role_name: mgrRole?.name || manager.designation || "",
        }
      : null,
    role: role
      ? {
          id: String(role._id),
          name: role.name,
          level: Role.effectiveLevel(role),
          scope: Role.effectiveScope(role),
        }
      : null,
    email: p.email || null,
    official_email: p.orgContactEmail || null,
    contact_email: p.orgContactEmail || p.email || null,
    login_email: p.email || null,
  };
}

function applyCriteria(snap, items, criteria, opts = {}) {
  const skip = opts.skip;
  const strictGeo = !!opts.strictGeography;
  let out = items;

  for (const field of GEO_FIELDS) {
    if (skip === field) continue;
    const v = criteria[field];
    if (!v) continue;
    const target = norm(v);
    out = out.filter(
      (p) => (!strictGeo && scopeOf(snap, p) === "ALL_INDIA") || norm(p[field]) === target,
    );
  }

  if (skip !== "designation" && criteria.designation) {
    const target = norm(criteria.designation);
    out = out.filter((p) => norm(p.designation) === target);
  }
  if (skip !== "roleId" && criteria.roleId) {
    out = out.filter((p) => p.roleId && String(p.roleId) === criteria.roleId);
  }
  if (skip !== "level" && criteria.level !== undefined && criteria.level !== null && criteria.level !== "") {
    const target = Number(criteria.level);
    if (!Number.isNaN(target)) {
      out = out.filter((p) => levelOf(snap, p) === target);
    }
  }
  return out;
}

function listEmployees(snap, params) {
  let items = applyCriteria(
    snap,
    snap.positions,
    {
      zone: params.zone,
      region: params.region,
      state: params.state,
      hq: params.hq,
      designation: params.designation,
      roleId: params.roleId,
      level: params.level,
    },
    { strictGeography: params.strictGeography },
  );

  if (params.manager) {
    const mgrLookup = findInSnapshot(snap, params.manager);
    const mgrKey = mgrLookup ? String(mgrLookup._id) : params.manager;
    items = items.filter(
      (p) =>
        (p.parentPositionId && String(p.parentPositionId) === mgrKey) ||
        norm(p.reportingManagerRaw) === norm(params.manager),
    );
  }
  if (params.vacantOnly) items = items.filter((p) => p.isVacant);
  if (params.filledOnly) items = items.filter((p) => !p.isVacant);

  if (params.q) {
    const needle = norm(params.q);
    const roleName = (pos) => {
      if (!pos.roleId) return "";
      return snap.roleById.get(String(pos.roleId))?.name || "";
    };
    items = items.filter((p) =>
      [
        p.name,
        p.empId,
        p.email,
        p.orgContactEmail,
        p.reportingManagerRaw,
        p.designation,
        roleName(p),
        p.hq,
        p.region,
        p.state,
        p.zone,
      ].some((v) => norm(v).includes(needle)),
    );
  }

  items = [...items].sort((a, b) => {
    const av = a.sno ?? 999999;
    const bv = b.sno ?? 999999;
    if (av !== bv) return av - bv;
    return (a.name || "").localeCompare(b.name || "");
  });

  const limit = params.limit ?? 200;
  if (limit) items = items.slice(0, limit);
  return items.map((p) => enrich(snap, p));
}

function subtree(snap, rootKey) {
  const root = findInSnapshot(snap, rootKey);
  if (!root) return null;
  const build = (id, depth) => {
    const p = snap.byId.get(id);
    const childIds = snap.childrenByParent.get(id) || [];
    const children = childIds.map((cid) => build(cid, depth + 1));
    return {
      ...enrich(snap, p),
      children,
      depth,
      direct_reports: children.length,
      total_descendants: children.reduce((sum, c) => sum + 1 + c.total_descendants, 0),
    };
  };
  return build(String(root._id), 0);
}

function ancestry(snap, key) {
  const start = findInSnapshot(snap, key);
  if (!start) return [];
  const path = [];
  const seen = new Set();
  let cursor = start;
  while (cursor && !seen.has(String(cursor._id))) {
    seen.add(String(cursor._id));
    path.push(enrich(snap, cursor));
    cursor = cursor.parentPositionId ? snap.byId.get(String(cursor.parentPositionId)) || null : null;
  }
  return path.reverse();
}

function roots(snap) {
  const ids = snap.childrenByParent.get("__root__") || [];
  return ids.map((id) => enrich(snap, snap.byId.get(id))).filter(Boolean);
}

function stats(snap) {
  const total = snap.positions.length;
  const vacant = snap.positions.filter((p) => p.isVacant).length;
  const filled = total - vacant;

  const byZone = {};
  const byDesignation = {};
  const byRole = {};
  const byLevel = {};

  for (const p of snap.positions) {
    if (p.zone) byZone[p.zone] = (byZone[p.zone] || 0) + 1;
    if (p.designation) byDesignation[p.designation] = (byDesignation[p.designation] || 0) + 1;
    const roleName = p.roleId ? snap.roleById.get(String(p.roleId))?.name : null;
    if (roleName) byRole[roleName] = (byRole[roleName] || 0) + 1;
    const lvl = String(levelOf(snap, p));
    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
  }

  const rootIds = snap.childrenByParent.get("__root__") || [];

  return {
    total,
    filled,
    vacant,
    unresolved: snap.positions.filter((p) => p.managerResolution === "orphan").length,
    roots: rootIds.length,
    roles: snap.roleById.size,
    max_level: snap.maxLevel,
    by_zone: byZone,
    by_designation: byDesignation,
    by_role: byRole,
    by_level: Object.fromEntries(Object.entries(byLevel).sort(([a], [b]) => Number(a) - Number(b))),
  };
}

function cascadingFilters(snap, params) {
  const criteria = {
    zone: params.zone,
    region: params.region,
    state: params.state,
    hq: params.hq,
    designation: params.designation,
    roleId: params.roleId,
    level: params.level,
  };

  function options(field) {
    const scope = applyCriteria(snap, snap.positions, criteria, {
      skip: field,
      strictGeography: params.strictGeography,
    });
    const counts = new Map();
    for (const p of scope) {
      const v = p[field];
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()))
      .map(([value, count]) => ({ value, count }));
  }

  function levelOptions() {
    const scope = applyCriteria(snap, snap.positions, criteria, {
      skip: "level",
      strictGeography: params.strictGeography,
    });
    const counts = new Map();
    for (const p of scope) {
      const lvl = levelOf(snap, p);
      counts.set(lvl, (counts.get(lvl) || 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([value, count]) => ({ value, count }));
  }

  const roleScope = applyCriteria(snap, snap.positions, criteria, {
    skip: "roleId",
    strictGeography: params.strictGeography,
  });
  const roleCounts = new Map();
  for (const p of roleScope) {
    if (!p.roleId) continue;
    const k = String(p.roleId);
    roleCounts.set(k, (roleCounts.get(k) || 0) + 1);
  }
  const rolesFacet = [];
  for (const [id, role] of snap.roleById) {
    const c = roleCounts.get(id);
    if (!c) continue;
    rolesFacet.push({
      value: id,
      label: role.name || "Unspecified",
      level: Role.effectiveLevel(role),
      scope: Role.effectiveScope(role),
      count: c,
    });
  }
  rolesFacet.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
  });

  return {
    zones: options("zone"),
    regions: options("region"),
    states: options("state"),
    hqs: options("hq"),
    designations: options("designation"),
    roles: rolesFacet,
    levels: levelOptions(),
    max_level: snap.maxLevel,
  };
}

function collectDescendantIds(snap, actorUserId) {
  const root = String(actorUserId);
  const out = new Set();
  function walk(id) {
    if (out.has(id)) return;
    out.add(id);
    for (const c of snap.childrenByParent.get(id) || []) {
      walk(String(c));
    }
  }
  walk(root);
  return out;
}

function filterSnapshotToDescendants(snap, actorUserId) {
  const allowed = collectDescendantIds(snap, String(actorUserId));
  const raw = snap.positions
    .filter((p) => allowed.has(String(p._id)))
    .map((p) => {
      const pid = p.parentPositionId ? String(p.parentPositionId) : null;
      if (pid && !allowed.has(pid)) {
        return { ...p, parentPositionId: null };
      }
      return p;
    });

  const byId = new Map();
  const byEmpId = new Map();
  const childrenByParent = new Map();

  for (const p of raw) {
    const id = String(p._id);
    byId.set(id, p);
    if (p.empId) byEmpId.set(String(p.empId).trim().toUpperCase(), p);
    const parentKey = p.parentPositionId ? String(p.parentPositionId) : "__root__";
    const arr = childrenByParent.get(parentKey) || [];
    arr.push(id);
    childrenByParent.set(parentKey, arr);
  }

  for (const [k, ids] of childrenByParent.entries()) {
    ids.sort((a, b) => {
      const A = byId.get(a);
      const B = byId.get(b);
      const av = A?.isVacant ? 1 : 0;
      const bv = B?.isVacant ? 1 : 0;
      if (av !== bv) return av - bv;
      return (A?.name || "").localeCompare(B?.name || "");
    });
    childrenByParent.set(k, ids);
  }

  return {
    tenantId: snap.tenantId,
    positions: raw,
    byId,
    byEmpId,
    childrenByParent,
    roleById: snap.roleById,
    maxLevel: snap.maxLevel,
  };
}

async function findUserDoc(tenantId, key, { includeLeft = false } = {}) {
  const q = { tenantId };
  if (!includeLeft) q.orgLeftAt = null;
  if (key && String(key).match(/^[a-f0-9]{24}$/i)) {
    const u = await User.findOne({ ...q, _id: key }).populate("roleIds").populate("reportingToUserId", "name empCode email");
    if (u) return u;
  }
  const snap = await loadSnapshot(tenantId);
  const p = findInSnapshot(snap, key);
  if (!p) return null;
  return User.findOne({ ...q, _id: p._id }).populate("roleIds").populate("reportingToUserId", "name empCode email");
}

module.exports = {
  loadSnapshot,
  findInSnapshot,
  enrich,
  listEmployees,
  subtree,
  ancestry,
  roots,
  stats,
  cascadingFilters,
  findUserDoc,
  userToPosition,
  collectDescendantIds,
  filterSnapshotToDescendants,
};
