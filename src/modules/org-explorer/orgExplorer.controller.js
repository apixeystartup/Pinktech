const fs = require("fs");
const path = require("path");
const ApiError = require("../../common/errors/ApiError");
const orgDirectory = require("./orgDirectory.service");
const orgMutations = require("./orgMutations.service");
const orgRegistry = require("./orgRegistry.service");
const orgWorkbookImport = require("./orgWorkbookImport.service");

function asStr(v) {
  return typeof v === "string" && v.length ? v : null;
}
function asBool(v) {
  if (v === true) return true;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

/** Full org tree: tenant admins only. Everyone else (including `role.view`) sees their subtree in ORG employee. */
function orgDirectoryFullAccess(req) {
  const p = req.auth?.permissionCodes || [];
  return p.includes("tenant.manage");
}

async function resolveOrgSnapshot(req) {
  const full = await orgDirectory.loadSnapshot(req.tenantId);
  if (orgDirectoryFullAccess(req)) return full;
  const actor = req.auth?.userId;
  if (!actor) return full;
  return orgDirectory.filterSnapshotToDescendants(full, actor);
}

async function resolveSubjectId(tenantId, key, req) {
  const full = await orgDirectory.loadSnapshot(tenantId);
  const p = orgDirectory.findInSnapshot(full, key);
  if (!p) throw new ApiError(404, "not_found");
  if (req && !orgDirectoryFullAccess(req)) {
    const allowed = orgDirectory.collectDescendantIds(full, req.auth.userId);
    if (!allowed.has(String(p._id))) throw new ApiError(404, "not_found");
  }
  return String(p._id);
}

async function listEmployees(req, res, next) {
  try {
    const snap = await resolveOrgSnapshot(req);
    const params = {
      q: asStr(req.query.q),
      zone: asStr(req.query.zone),
      region: asStr(req.query.region),
      state: asStr(req.query.state),
      hq: asStr(req.query.hq),
      designation: asStr(req.query.designation),
      roleId: asStr(req.query.role_id),
      level: asStr(req.query.level),
      manager: asStr(req.query.manager),
      vacantOnly: asBool(req.query.vacant_only),
      filledOnly: asBool(req.query.filled_only),
      strictGeography: asBool(req.query.strict_geography),
      limit: req.query.limit ? Number(req.query.limit) : 1000,
    };
    const items = orgDirectory.listEmployees(snap, params);
    res.json({ count: items.length, items });
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
    const path = orgDirectory.ancestry(snap, req.params.key);
    if (!path.length) throw new ApiError(404, "not_found");
    res.json({ ancestry: path });
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
    const subjectId = await resolveSubjectId(req.tenantId, req.params.key, req);
    const emp = await orgMutations.putEmployee(req.tenantId, subjectId, req.body || {}, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postEmployee(req, res, next) {
  try {
    const emp = await orgMutations.addEmployee(req.tenantId, req.body || {}, req.auth);
    res.status(201).json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postLeave(req, res, next) {
  try {
    const subjectId = await resolveSubjectId(req.tenantId, req.params.key, req);
    const result = await orgMutations.markLeft(req.tenantId, subjectId, req.body?.reassign_to || null, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function postRestore(req, res, next) {
  try {
    const emp = await orgMutations.restoreEmployee(req.tenantId, req.params.key, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postReplace(req, res, next) {
  try {
    const subjectId = await resolveSubjectId(req.tenantId, req.params.key, req);
    const emp = await orgMutations.replacePerson(req.tenantId, subjectId, req.body || {}, req.auth);
    res.json({ employee: emp });
  } catch (e) {
    next(e);
  }
}

async function postReassign(req, res, next) {
  try {
    const fromId = await resolveSubjectId(req.tenantId, req.params.key, req);
    let toId = req.body?.to_id || null;
    if (toId) {
      toId = await resolveSubjectId(req.tenantId, toId, req);
    }
    const result = await orgMutations.reassignReports(req.tenantId, fromId, toId, req.body?.report_ids, req.auth);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function getRemoved(req, res, next) {
  try {
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
    const data = await orgRegistry.listOrgRoles(req.tenantId);
    res.json(data);
  } catch (e) {
    next(e);
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
    const data = await orgRegistry.putOrgRole(req.tenantId, req.params.id, req.body || {}, req.auth);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function postRoleReset(req, res, next) {
  try {
    const data = await orgRegistry.resetOrgRole(req.tenantId, req.params.id, req.auth);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function postRoleCreate(req, res, next) {
  try {
    const data = await orgRegistry.createOrgRole(req.tenantId, req.body || {}, req.auth);
    res.status(201).json(data);
  } catch (e) {
    next(e);
  }
}

async function postAutoDetect(req, res, next) {
  try {
    const summary = await orgRegistry.autoDetectRoles(req.tenantId, req.auth);
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

async function postResetAllRoles(req, res, next) {
  try {
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
    const candidates = [
      path.join(__dirname, "..", "..", "..", "test", "SAMPLE ORG (1).xlsx"),
      path.join(process.cwd(), "test", "SAMPLE ORG (1).xlsx"),
      path.join(process.cwd(), "SAMPLE ORG (1).xlsx"),
    ];
    let buffer = null;
    let filename = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        buffer = fs.readFileSync(p);
        filename = path.basename(p);
        break;
      }
    }
    if (!buffer) {
      throw new ApiError(404, "Sample workbook not found on server — upload an .xlsx file instead");
    }
    const summary = await orgWorkbookImport.runOrgWorkbookImport({
      tenantId: req.tenantId,
      buffer,
      filename,
      actor: req.auth,
    });
    res.json({ ok: true, ...summary });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  listEmployees,
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
};
