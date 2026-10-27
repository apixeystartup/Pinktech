const mongoose = require("mongoose");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const { norm } = require("../utils/orgNorm");
const { primaryOrgRoleId } = require("../utils/orgPrimaryRole");
const { isPlatformTenant } = require("@pink/shared");

const PLACEHOLDER_RE = /^\s*VACANT\s+([A-Z]+)\s+REPORT\s+TO\s+([A-Z]+)\s*$/i;
const VACANT_EMPID_RE = /^\s*VACANT\s*[-–]\s*(.+)\s*$/i;
const GEO_FIELDS = ["zone", "region", "area", "state", "hq"];
const VIRTUAL_SUPER_ADMIN_ID = "virtual-super-admin";
// Labels for the injected platform root: Pinktech is the super admin for all
// tenants, so the node carries the platform brand, not a tenant's name/code.
const PLATFORM_ROOT_NAME = "Pinktech";
const PLATFORM_ROOT_ROLE = "Super Admin";
const PLATFORM_ROOT_CODE = "PINKTECH";

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
    area: u.area || null,
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
    email: u.email || null,
    orgContactEmail: u.orgContactEmail || null,
  };
}

function comparePositions(a, b) {
  const vacantOrder = Number(!!a?.isVacant) - Number(!!b?.isVacant);
  if (vacantOrder) return vacantOrder;
  for (const field of ["zone", "region", "area", "hq"]) {
    const difference = (a?.[field] || "").localeCompare(b?.[field] || "", undefined, { sensitivity: "base" });
    if (difference) return difference;
  }
  return (a?.name || "").localeCompare(b?.name || "", undefined, { sensitivity: "base" });
}

async function loadSnapshot(tenantId) {
  const [workbookUsers, roles] = await Promise.all([
    User.find({
      tenantId,
      orgLeftAt: null,
      orgFromWorkbook: true,
      status: { $in: ["ACTIVE", "INVITED", "OTP_PENDING"] },
    })
      .populate("roleIds")
      .populate("reportingToUserId", "name email empCode")
      .sort({ name: 1 }),
    // Include SYSTEM roles too so admin accounts (e.g. a tenant/super admin whose
    // only role is a system role) resolve to a real role name instead of "Unspecified".
    Role.find({ tenantId }),
  ]);

  const managerIds = new Set();
  for (const u of workbookUsers) {
    const mid = u.reportingToUserId;
    if (mid) managerIds.add(String(mid._id || mid));
  }

  const conditions = [];
  if (managerIds.size) conditions.push({ _id: { $in: [...managerIds] } });
  // Include admin accounts and manually-added org members even when they have no
  // employee code — any non-workbook member with a role assigned belongs in the tree.
  conditions.push({
    roleIds: { $type: "array", $ne: [] },
  });

  let externalManagerUsers = [];
  if (conditions.length) {
    externalManagerUsers = await User.find({
      tenantId,
      orgLeftAt: null,
      orgFromWorkbook: { $ne: true },
      status: { $in: ["ACTIVE", "INVITED", "OTP_PENDING"] },
      $or: conditions,
    })
      .populate("roleIds")
      .populate("reportingToUserId", "name empCode email")
      .sort({ name: 1 });
  }

  const users = [...workbookUsers, ...externalManagerUsers];

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
    ids.sort((a, b) => comparePositions(byId.get(a), byId.get(b)));
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

function rebuildIndexes(snap, positions) {
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
    ids.sort((a, b) => comparePositions(byId.get(a), byId.get(b)));
    childrenByParent.set(k, ids);
  }

  return { ...snap, positions, byId, byEmpId, childrenByParent };
}

async function findTenantDoc(tenantId) {
  try {
    const col = mongoose.connection.collection("tenants");
    const _id = mongoose.Types.ObjectId.isValid(tenantId)
      ? new mongoose.Types.ObjectId(String(tenantId))
      : tenantId;
    return await col.findOne({ _id });
  } catch {
    return null;
  }
}

function virtualRootPosition() {
  return {
    _id: VIRTUAL_SUPER_ADMIN_ID,
    empId: null,
    name: PLATFORM_ROOT_NAME,
    designation: PLATFORM_ROOT_ROLE,
    roleId: null,
    hq: null,
    area: null,
    zone: null,
    region: null,
    state: null,
    doj: null,
    dob: null,
    gender: null,
    isVacant: false,
    addedManually: false,
    parentPositionId: null,
    managerResolution: "root",
    reportingManagerRaw: null,
    email: null,
    orgContactEmail: null,
    pinktechCode: PLATFORM_ROOT_CODE,
    isVirtualRoot: true,
  };
}

// The platform root can carry children from several tenants at once (the Home
// roll-up). Group them tenant-by-tenant using the loader's tenant order, then
// vacant-last, then by name, so the combined tree reads one tenant at a time.
function orderPlatformRootChildren(snap) {
  const ids = snap.childrenByParent.get(VIRTUAL_SUPER_ADMIN_ID);
  if (!ids || !ids.length) return snap;
  const order = snap.tenantOrder instanceof Map ? snap.tenantOrder : null;
  ids.sort((a, b) => {
    const A = snap.byId.get(a) || {};
    const B = snap.byId.get(b) || {};
    if (order) {
      const ao = order.has(String(A.tenantId)) ? order.get(String(A.tenantId)) : Number.MAX_SAFE_INTEGER;
      const bo = order.has(String(B.tenantId)) ? order.get(String(B.tenantId)) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
    }
    const av = A.isVacant ? 1 : 0;
    const bv = B.isVacant ? 1 : 0;
    if (av !== bv) return av - bv;
    return comparePositions(A, B);
  });
  return snap;
}

// Hang every top-level person of the snapshot under the read-only Pinktech root.
// Defensive: never stack a second platform root if one is already present.
function attachVirtualRoot(snap) {
  if (snap.positions.some((p) => p.isVirtualRoot)) return snap;
  const rootIds = new Set((snap.childrenByParent.get("__root__") || []).map(String));
  const positions = snap.positions.map((p) =>
    rootIds.has(String(p._id)) ? { ...p, parentPositionId: VIRTUAL_SUPER_ADMIN_ID } : p,
  );
  positions.push(virtualRootPosition());
  return orderPlatformRootChildren(rebuildIndexes(snap, positions));
}

/**
 * Pinktech (the platform) is the super admin for every tenant — there is no
 * per-tenant super admin. When a platform super admin explores a tenant, inject
 * a read-only "Pinktech" root above that tenant's own roots so the tree reads
 * Pinktech -> tenant admin(s) -> employees. The node is structural: it is never
 * counted as a person and never attached to mutations.
 */
async function withVirtualSuperAdminRoot(snap, tenantId) {
  const tenant = await findTenantDoc(tenantId);
  const pinktechCode = tenant?.code || null;
  const tagged = rebuildIndexes(
    snap,
    snap.positions.map((p) => ({ ...p, pinktechCode })),
  );
  return attachVirtualRoot(tagged);
}

/**
 * Every active customer tenant, name-sorted. The platform tenant (PINKTECH in
 * new databases, PLATFORM in older ones) is the root of the roll-up, not a
 * child of itself, so it is deliberately excluded — otherwise the platform
 * super admins would appear as ordinary people under the virtual root.
 */
async function listCustomerTenants() {
  const tenants = await mongoose.connection
    .collection("tenants")
    .find({ status: "ACTIVE" })
    .toArray();
  const customers = tenants.filter((t) => !isPlatformTenant(t));
  customers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return customers;
}

/**
 * The Home view for a platform super admin rolls up every active customer tenant
 * as one read-only tree: Pinktech -> each tenant's admin(s) -> that tenant's
 * people. The platform tenant itself is skipped (Pinktech *is* the platform, so
 * its own tenant is not a child of itself). Each position keeps its own tenant's
 * code, and tenantId, so a row can be labelled and edited in place.
 */
async function loadPlatformSnapshot() {
  const tenants = await listCustomerTenants();

  const merged = {
    tenantId: null,
    positions: [],
    byId: new Map(),
    byEmpId: new Map(),
    childrenByParent: new Map(),
    roleById: new Map(),
    maxLevel: 1,
    tenantOrder: new Map(),
  };

  let index = 0;
  for (const tenant of tenants) {
    const tid = String(tenant._id);
    merged.tenantOrder.set(tid, index);
    index += 1;

    const snap = await loadSnapshot(tid);
    if (snap.maxLevel > merged.maxLevel) merged.maxLevel = snap.maxLevel;
    for (const [roleId, role] of snap.roleById) merged.roleById.set(String(roleId), role);
    for (const p of snap.positions) {
      const tagged = { ...p, tenantId: tid, pinktechCode: tenant.code || null };
      merged.positions.push(tagged);
      merged.byId.set(String(tagged._id), tagged);
    }
  }

  for (const p of merged.positions) {
    const id = String(p._id);
    if (p.empId) merged.byEmpId.set(String(p.empId).trim().toUpperCase(), p);
    const parentKey = p.parentPositionId ? String(p.parentPositionId) : "__root__";
    const arr = merged.childrenByParent.get(parentKey) || [];
    arr.push(id);
    merged.childrenByParent.set(parentKey, arr);
  }

  for (const [k, ids] of merged.childrenByParent.entries()) {
    ids.sort((a, b) => comparePositions(merged.byId.get(a), merged.byId.get(b)));
    merged.childrenByParent.set(k, ids);
  }

  return merged;
}

function withPlatformVirtualRoot(snap) {
  return attachVirtualRoot(snap);
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

  let externalManager = null;
  let managerDisplayName = null;

  if (manager) {
    if (manager.isVacant && manager.empId) {
      managerDisplayName = `VACANT - ${manager.empId}`;
    } else {
      managerDisplayName = manager.name;
    }
  } else if (p.reportingManagerRaw) {
    const vacantMatch = VACANT_EMPID_RE.exec(p.reportingManagerRaw);
    if (vacantMatch) {
      const empIdPart = vacantMatch[1].trim();
      const empIdUser = snap.positions.find(
        (pos) => pos.empId && pos.empId.toUpperCase() === empIdPart.toUpperCase()
      );
      if (empIdUser) {
        managerDisplayName = empIdUser.isVacant && empIdUser.empId ? `VACANT - ${empIdUser.empId}` : empIdUser.name;
      } else {
        managerDisplayName = `VACANT - ${empIdPart}`;
      }
    } else if (!PLACEHOLDER_RE.test(p.reportingManagerRaw) && p.managerResolution === "external_root") {
      externalManager = p.reportingManagerRaw;
      managerDisplayName = p.reportingManagerRaw;
    } else {
      managerDisplayName = p.reportingManagerRaw;
    }
  }

  const mgrRole = manager?.roleId ? snap.roleById.get(String(manager.roleId)) || null : null;

  return {
    id: String(p._id),
    emp_id: p.empId,
    name: p.name,
    designation: p.designation,
    role_id: role ? String(role._id) : null,
    role_name: role ? role.name : p.designation || "Unspecified",
    // The injected platform root sits above the tenant's own top level and
    // spans every scope: Pinktech is super admin for all tenants.
    level: p.isVirtualRoot ? snap.maxLevel + 1 : role ? Role.effectiveLevel(role) : 1,
    scope: p.isVirtualRoot ? "ALL_INDIA" : role ? Role.effectiveScope(role) : "HQ",
    hq: p.hq,
    area: p.area,
    zone: p.zone,
    region: p.region,
    is_vacant: p.isVacant,
    added_manually: p.addedManually,
    manager_id: p.parentPositionId ? String(p.parentPositionId) : null,
    manager_resolution: p.managerResolution,
    external_manager: externalManager,
    manager_display_name: managerDisplayName,
    direct_reports: childrenIds.length,
    manager: manager
      ? {
          id: String(manager._id),
          name: manager.name,
          emp_id: manager.empId || null,
          is_vacant: !!manager.isVacant,
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
    pinktech_code: p.pinktechCode || null,
    is_virtual_root: !!p.isVirtualRoot,
    // Which tenant this person belongs to. In a single-tenant snapshot it is the
    // snapshot's tenant; in the Home roll-up each row carries its own tenant so
    // the UI can label it and target edits at the right organization.
    tenant_id: p.tenantId ? String(p.tenantId) : snap.tenantId ? String(snap.tenantId) : null,
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
      area: params.area,
      state: params.state,
      hq: params.hq,
      designation: params.designation,
      roleId: params.roleId,
      level: params.level,
    },
    { strictGeography: params.strictGeography },
  );

  // The injected Super Admin root is a structural node, not a person.
  items = items.filter((p) => !p.isVirtualRoot);

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
        p.area,
        p.region,
        p.state,
        p.zone,
      ].some((v) => norm(v).includes(needle)),
    );
  }

  items = [...items].sort(comparePositions);

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

function filteredTree(snap, params) {
  const matches = listEmployees(snap, { ...params, limit: 0 });
  const includedIds = new Set();

  for (const match of matches) {
    let position = snap.byId.get(String(match.id));
    const path = new Set();
    while (position && !path.has(String(position._id))) {
      const id = String(position._id);
      path.add(id);
      includedIds.add(id);
      position = position.parentPositionId
        ? snap.byId.get(String(position.parentPositionId))
        : null;
    }
  }

  function build(id, depth, ancestors = new Set()) {
    if (ancestors.has(id)) return null;
    const position = snap.byId.get(id);
    if (!position || !includedIds.has(id)) return null;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const children = (snap.childrenByParent.get(id) || [])
      .map((childId) => build(String(childId), depth + 1, nextAncestors))
      .filter(Boolean);

    return {
      ...enrich(snap, position),
      children,
      depth,
      direct_reports: children.length,
      total_descendants: children.reduce(
        (total, child) => total + 1 + child.total_descendants,
        0,
      ),
    };
  }

  const roots = (snap.childrenByParent.get("__root__") || [])
    .map((rootId) => build(String(rootId), 0))
    .filter(Boolean);

  return { count: matches.length, roots };
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
  // The injected Super Admin root is a structural node, not a person.
  const people = snap.positions.filter((p) => !p.isVirtualRoot);
  const total = people.length;
  const vacant = people.filter((p) => p.isVacant).length;
  const filled = total - vacant;

  const byZone = {};
  const byDesignation = {};
  const byRole = {};
  const byLevel = {};

  for (const p of people) {
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
    unresolved: people.filter((p) => p.managerResolution === "orphan").length,
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
  // The injected Super Admin root is structural and should not appear in facets.
  const positions = snap.positions.filter((p) => !p.isVirtualRoot);
  const criteria = {
    zone: params.zone,
    region: params.region,
    area: params.area,
    state: params.state,
    hq: params.hq,
    designation: params.designation,
    roleId: params.roleId,
    level: params.level,
  };

  function options(field) {
    const scope = applyCriteria(snap, positions, criteria, {
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
    const scope = applyCriteria(snap, positions, criteria, {
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

  const roleScope = applyCriteria(snap, positions, criteria, {
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
    areas: options("area"),
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
    ids.sort((a, b) => comparePositions(byId.get(a), byId.get(b)));
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

/**
 * Locate a person across every tenant by id, used by super-admin edits started
 * from the Home roll-up. Those requests carry no tenant override, so the owning
 * tenant has to be derived from the record itself before a mutation can run.
 */
async function findTenantForSubject(key) {
  if (!key || !/^[a-f0-9]{24}$/i.test(String(key).trim())) return null;
  const id = String(key).trim();
  const user = await User.findOne({ _id: id }).select("tenantId").lean();
  if (!user?.tenantId) return null;
  return { id: String(user._id), tenantId: String(user.tenantId) };
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
  filteredTree,
  ancestry,
  roots,
  stats,
  cascadingFilters,
  findUserDoc,
  findTenantForSubject,
  userToPosition,
  collectDescendantIds,
  filterSnapshotToDescendants,
  withVirtualSuperAdminRoot,
  loadPlatformSnapshot,
  withPlatformVirtualRoot,
  listCustomerTenants,
  VIRTUAL_SUPER_ADMIN_ID,
};
