const fs = require("fs");
const path = require("path");
const ApiError = require("@pink/shared").ApiError;
const orgDirectory = require("./orgDirectory.service");
const orgMutations = require("./orgMutations.service");
const orgRegistry = require("./orgRegistry.service");
const orgWorkbookImport = require("./orgWorkbookImport.service");
const rollbackService = require("./orgRollback.service");

function asStr(v) {
  return typeof v === "string" && v.length ? v : null;
}
function asBool(v) {
  if (v === true) return true;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

// Access control is disabled (every account carries "*"), so the org directory
// must decide from the account role: admins see the whole organization, while
// an employee only ever sees themselves and their own team.
function orgDirectoryFullAccess(req) {
  return Boolean(req.auth?.isOrgAdmin);
}

async function resolveOrgSnapshot(req) {
  // Home view for a platform super admin (no tenant override chosen): one
  // read-only roll-up of every customer tenant under the Pinktech root.
  if (asBool(req.query.all_tenants) && req.auth?.isSuperAdmin) {
    const full = await orgDirectory.loadPlatformSnapshot();
    const rooted = full.positions.length ? orgDirectory.withPlatformVirtualRoot(full) : full;
    if (orgDirectoryFullAccess(req)) return rooted;
    const actor = req.auth?.userId;
    if (!actor) return rooted;
    return orgDirectory.filterSnapshotToDescendants(rooted, actor);
  }
  let full = await orgDirectory.loadSnapshot(req.tenantId);
  // Pinktech (the platform) is the super admin for every tenant, so the
  // read-only Pinktech root sits above the org for the platform super admin
  // and for a tenant admin viewing their own organization alike. Plain
  // employees keep their personal scoped view with no platform root.
  const seesPlatformRoot = req.auth?.isSuperAdmin || req.auth?.accountRole === "tenant_admin";
  if (seesPlatformRoot && full.byId.size > 0) {
    full = await orgDirectory.withVirtualSuperAdminRoot(full, req.tenantId);
  }
  if (orgDirectoryFullAccess(req)) return full;
  const actor = req.auth?.userId;
  if (!actor) return full;
  return orgDirectory.filterSnapshotToDescendants(full, actor);
}

/**
 * Resolve a subject key to { id, tenantId }. Normally the key lives in the
 * request's tenant; from the Home roll-up it may belong to another tenant, so a
 * super admin's edit is routed to the record's own tenant instead of silently
 * failing (or worse, hitting the wrong organization).
 */
async function resolveSubject(tenantId, key, req) {
  const full = await orgDirectory.loadSnapshot(tenantId);
  const p = orgDirectory.findInSnapshot(full, key);
  if (p) {
    if (req && !orgDirectoryFullAccess(req)) {
      const allowed = orgDirectory.collectDescendantIds(full, req.auth.userId);
      if (!allowed.has(String(p._id))) throw new ApiError(404, "not_found");
    }
    return { id: String(p._id), tenantId };
  }
  // Not in the live snapshot. It may be someone who has left (restore) or — for
  // a super admin working from the Home roll-up — a record in another tenant.
  // A plain member may only ever reach records of their own tenant.
  const owner = await orgDirectory.findTenantForSubject(key);
  if (owner && (String(owner.tenantId) === String(tenantId) || req?.auth?.isSuperAdmin)) {
    return owner;
  }
  throw new ApiError(404, "not_found");
}

async function listEmployees(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const params = employeeCriteria(req.query);
    const items = orgDirectory.listEmployees(snap, params);
    res.json({ count: items.length, items });
  } catch (e) {
    next(e);
  }
}

function employeeCriteria(query) {
  return {
    q: asStr(query.q),
    zone: asStr(query.zone),
    region: asStr(query.region),
    state: asStr(query.state),
    hq: asStr(query.hq),
    designation: asStr(query.designation),
    roleId: asStr(query.role_id),
    level: asStr(query.level),
    manager: asStr(query.manager),
    vacantOnly: asBool(query.vacant_only),
    filledOnly: asBool(query.filled_only),
    strictGeography: asBool(query.strict_geography),
    limit: query.limit ? Number(query.limit) : 1000,
  };
}

async function getFilteredTree(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const tree = orgDirectory.filteredTree(snap, employeeCriteria(req.query));
    res.json(tree);
  } catch (e) {
    next(e);
  }
}

async function getEmployee(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const p = orgDirectory.findInSnapshot(snap, req.params.key);
    if (!p) throw new ApiError(404, "not_found");
    res.json({ employee: orgDirectory.enrich(snap, p) });
  } catch (e) {
    next(e);
  }
}

async function getSubtree(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const tree = orgDirectory.subtree(snap, req.params.key);
    if (!tree) throw new ApiError(404, "not_found");
    res.json({ root: tree });
  } catch (e) {
    next(e);
  }
}

async function getAncestry(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const ancestryPath = orgDirectory.ancestry(snap, req.params.key);
    if (!ancestryPath.length) throw new ApiError(404, "not_found");
    res.json({ ancestry: ancestryPath });
  } catch (e) {
    next(e);
  }
}

async function getRoots(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    res.json({ roots: orgDirectory.roots(snap) });
  } catch (e) {
    next(e);
  }
}

async function getStats(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    res.json(orgDirectory.stats(snap));
  } catch (e) {
    next(e);
  }
}

async function getFilters(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const params = {
      zone: asStr(req.query.zone),
      region: asStr(req.query.region),
      state: asStr(req.query.state),
      hq: asStr(req.query.hq),
      designation: asStr(req.query.designation),
      roleId: asStr(req.query.role_id),
      level: asStr(req.query.level),
      strictGeography: asBool(req.query.strict_geography),
    };
    res.json(orgDirectory.cascadingFilters(snap, params));
  } catch (e) {
    next(e);
  }
}

async function putEmployee(req, res, next) {
  try {
    const subject = await resolveSubject(req.tenantId, req.params.key, req);
    const emp = await orgMutations.putEmployee(subject.tenantId, subject.id, req.body || {}, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postEmployee(req, res, next) {
  try {
    // A person is always created inside the tenant they belong to. From the Home
    // roll-up the row's tenant arrives in the body (the UI knows which branch the
    // "+ Add" was clicked from); otherwise the request's own tenant is used. Only
    // the platform super admin may name a tenant other than the request's own —
    // a tenant admin can never create a person outside its own organization.
    const body = req.body || {};
    const tenantId = asStr(body.tenant_id) || req.tenantId;
    if (String(tenantId) !== String(req.tenantId) && !req.auth?.isSuperAdmin) {
      throw new ApiError(403, "Tenant admins can only add people to their own organization");
    }
    const payload = { ...body };
    delete payload.tenant_id;
    const emp = await orgMutations.addEmployee(tenantId, payload, req.auth);
    res.status(201).json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postLeave(req, res, next) {
  try {
    const subject = await resolveSubject(req.tenantId, req.params.key, req);
    let reassignTo = req.body?.reassign_to || null;
    if (reassignTo) {
      reassignTo = (await resolveSubject(subject.tenantId, reassignTo, req)).id;
    }
    const result = await orgMutations.markLeft(subject.tenantId, subject.id, reassignTo, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function postRestore(req, res, next) {
  try {
    const subject = await resolveSubject(req.tenantId, req.params.key, req);
    const emp = await orgMutations.restoreEmployee(subject.tenantId, subject.id, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postReplace(req, res, next) {
  try {
    const subject = await resolveSubject(req.tenantId, req.params.key, req);
    const emp = await orgMutations.replacePerson(subject.tenantId, subject.id, req.body || {}, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postReassign(req, res, next) {
  try {
    const from = await resolveSubject(req.tenantId, req.params.key, req);
    let toId = req.body?.to_id || null;
    if (toId) {
      toId = (await resolveSubject(from.tenantId, toId, req)).id;
    }
    const result = await orgMutations.reassignReports(from.tenantId, from.id, toId, req.body?.report_ids, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function getRemoved(req, res, next) {
  try {
    // Only admins manage the removed list (and only they see the entry point).
    if (!orgDirectoryFullAccess(req)) {
      res.json({ count: 0, items: [] });
      return;
    }
    // Home roll-up: show everyone who has left, from every customer tenant, each
    // row tagged with the tenant it came from.
    if (asBool(req.query.all_tenants) && req.auth?.isSuperAdmin) {
      const tenants = await orgDirectory.listCustomerTenants();
      const all = [];
      for (const tenant of tenants) {
        const items = await orgMutations.removedPeople(String(tenant._id));
        for (const item of items) {
          all.push({ ...item, tenant_id: String(tenant._id), pinktech_code: tenant.code || null });
        }
      }
      all.sort((a, b) => String(b.left_at || "").localeCompare(String(a.left_at || "")));
      res.json({ count: all.length, items: all });
      return;
    }
    const items = await orgMutations.removedPeople(req.tenantId);
    res.json({ count: items.length, items });
  } catch (e) {
    next(e);
  }
}

async function postHierarchyReset(req, res, next) {
  try {
    const result = await orgMutations.resetHierarchy(req.tenantId, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function listRoles(req, res, next) {
  try {
    // Home is a roll-up, not a tenant: roles belong to tenants, so there is
    // nothing to manage here — notably never the platform's own roles (the
    // Super Admin seat must not surface as a manageable row).
    if (req.auth?.isSuperAdmin && !req.auth?.actingAsTenantId) {
      res.json({ roles: [] });
      return;
    }
    const data = await orgRegistry.listOrgRoles(req.tenantId);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

function requireTenantContext(req) {
  if (req.auth?.isSuperAdmin && !req.auth?.actingAsTenantId) {
    throw new ApiError(400, "Select a tenant first — roles are managed per tenant");
  }
}

async function getRole(req, res, next) {
  try {
    const data = await orgRegistry.getOrgRole(req.tenantId, req.params.id);
    if (!data) throw new ApiError(404, "not_found");
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function putRole(req, res, next) {
  try {
    requireTenantContext(req);
    const data = await orgRegistry.putOrgRole(req.tenantId, req.params.id, req.body || {}, req.auth);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function postRoleReset(req, res, next) {
  try {
    requireTenantContext(req);
    const data = await orgRegistry.resetOrgRole(req.tenantId, req.params.id, req.auth);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function postRoleCreate(req, res, next) {
  try {
    requireTenantContext(req);
    const data = await orgRegistry.createOrgRole(req.tenantId, req.body || {}, req.auth);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
}

async function postAutoDetect(req, res, next) {
  try {
    requireTenantContext(req);
    const summary = await orgRegistry.autoDetectRoles(req.tenantId, req.auth);
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

async function postResetAllRoles(req, res, next) {
  try {
    requireTenantContext(req);
    const result = await orgRegistry.resetAllOrgRoles(req.tenantId, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function postMergeRoles(req, res, next) {
  try {
    const { from_id: fromId, into_id: intoId } = req.body || {};
    if (!fromId || !intoId) throw new ApiError(400, "from_id and into_id required");
    const data = await orgRegistry.mergeOrgRoles(req.tenantId, fromId, intoId, req.auth);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function postOrgWorkbookImport(req, res, next) {
  try {
    if (!req.file) {
      throw new ApiError(400, "File is required");
    }
    const summary = await orgWorkbookImport.runOrgWorkbookImport({
      tenantId: req.tenantId,
      buffer: req.file.buffer,
      filename: req.file.originalname || "workbook.xlsx",
      actor: req.auth,
    });
    res.status(201).json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
}

async function postReload(req, res, next) {
  try {
    const hasData = rollbackService.hasRollback(req.tenantId);
    if (!hasData) {
      throw new ApiError(404, "No previous data to restore");
    }

    const filePath = rollbackService.rollbackPath(req.tenantId);
    const buffer = fs.readFileSync(filePath);

    const summary = await orgWorkbookImport.runOrgWorkbookImport({
      tenantId: req.tenantId,
      buffer,
      filename: "rollback.xlsx",
      actor: req.auth,
      skipRollback: true,
    });

    await rollbackService.deleteRollback(req.tenantId);

    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
}

async function postRollback(req, res, next) {
  try {
    const hasData = rollbackService.hasRollback(req.tenantId);
    if (!hasData) {
      throw new ApiError(404, "No rollback data available for this tenant");
    }

    const filePath = rollbackService.rollbackPath(req.tenantId);
    const fs = require("fs");
    const buffer = fs.readFileSync(filePath);

    const summary = await orgWorkbookImport.runOrgWorkbookImport({
      tenantId: req.tenantId,
      buffer,
      filename: "rollback.xlsx",
      actor: req.auth,
      skipRollback: true,
    });

    await rollbackService.deleteRollback(req.tenantId);

    res.json({ ok: true, summary });
  } catch (e) {
    next(e);
  }
}

async function getRollbackStatus(req, res, next) {
  try {
    const hasData = rollbackService.hasRollback(req.tenantId);
    res.json({ hasRollback: hasData });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  listEmployees,
  getFilteredTree,
  getEmployee,
  getSubtree,
  getAncestry,
  getRoots,
  getStats,
  getFilters,
  putEmployee,
  postEmployee,
  postLeave,
  postRestore,
  postReplace,
  postReassign,
  getRemoved,
  postHierarchyReset,
  listRoles,
  getRole,
  putRole,
  postRoleReset,
  postRoleCreate,
  postAutoDetect,
  postResetAllRoles,
  postMergeRoles,
  postReload,
  postOrgWorkbookImport,
  postRollback,
  getRollbackStatus,
};
