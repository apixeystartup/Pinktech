/**
 * Org Explorer Excel import — same workbook semantics as test/server (parse + manager graph + role-by-designation).
 * Persists to Pink User + Role and runs the org role engine.
 */

const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const Permission = require("../../models/permission.model");
const Import = require("../../models/import.model");
const ImportError = require("../../models/importError.model");
const ApiError = require("../../common/errors/ApiError");
const { norm, stripVacantSuffix, titleCase } = require("../../utils/orgNorm");
const { parseOrgWorkbookBuffer } = require("./orgWorkbookParser.service");
const rolesService = require("../roles/roles.service");

const PLACEHOLDER_RE = /^\s*VACANT\s+([A-Z]+)\s+REPORT\s+TO\s+([A-Z]+)\s*$/i;

const ROLE_TOKENS = {
  "GENERAL MANAGER": "GM",
  "SALES MANAGER": "SM",
  "ZONAL BUSINESS MANAGER": "ZBM",
  "REGIONAL BUSINESS MANAGER": "RBM",
  "DEPUTY REGIONAL BUSINESS MANAGER": "RBM",
  "AREA BUSINESS MANAGER": "ABM",
  "SENIOR AREA BUSINESS MANAGER": "ABM",
  "BUSINESS MANAGER": "BM",
  "TRAINEE BUSINESS MANAGER": "BM",
};

const ROLE_RANK = {
  GM: 6,
  SM: 5,
  ZBM: 4,
  RBM: 3,
  ABM: 2,
  BM: 1,
};

function roleOf(designation) {
  if (!designation) return null;
  return ROLE_TOKENS[designation.trim().toUpperCase()] || null;
}

function pickRandomPermissions(permissionIds) {
  if (!permissionIds.length) return [];
  const shuffled = [...permissionIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = Math.max(1, Math.ceil(shuffled.length * 0.4));
  return shuffled.slice(0, count);
}

function workbookEmail({ tenantId, rowNumber, empId, name, isVacant }) {
  const t = String(tenantId).replace(/[^a-f0-9]/gi, "").slice(-8);
  if (isVacant) {
    return `vacant.r${rowNumber}.t${t}@org-sheet.pink`;
  }
  const raw = (empId || name || `row${rowNumber}`).toString();
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || `row${rowNumber}`;
  return `${base}.r${rowNumber}.t${t}@org-sheet.pink`;
}

function isSyntheticOrgEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@org-sheet.pink") ||
    e.endsWith("@import.local") ||
    e.endsWith("@tenant.pink.local")
  );
}

function normalizeWorkbookEmail(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw)
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^['"<(]+|[>'"),.;]+$/g, "")
    .trim();
  if (/^mailto:/i.test(s)) {
    s = s.replace(/^mailto:/i, "").split(/[?#]/)[0].trim();
  }
  s = s.toLowerCase();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    const m = s.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
    if (!m) return null;
    s = m[1].toLowerCase();
  }
  return s;
}

/**
 * Copy normalized sheet email into orgContactEmail for every non-vacant row (always refreshed on re-import).
 */
function applyOfficialEmailsFromSheet(users, rows) {
  let stored = 0;
  const n = Math.min(users.length, rows.length);
  for (let i = 0; i < n; i += 1) {
    const row = rows[i];
    const u = users[i];
    if (!u) continue;
    if (row.isVacant) {
      u.orgContactEmail = null;
      continue;
    }
    const m = normalizeWorkbookEmail(row.workEmail);
    if (m) {
      u.orgContactEmail = m;
      stored += 1;
    } else {
      u.orgContactEmail = null;
    }
  }
  return stored;
}

/**
 * Set User.email from the workbook column when the row has a valid address and this user still
 * uses a synthetic placeholder. Respects tenant-wide uniqueness and first-claim within the import batch.
 */
async function applyWorkbookSheetEmails(tenantId, users, rows) {
  const emailsParsedFromWorkbook = rows.filter(
    (r) => !r.isVacant && r.empId && normalizeWorkbookEmail(r.workEmail),
  ).length;

  const promote = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.isVacant) continue;
    const m = normalizeWorkbookEmail(row.workEmail);
    if (!m) continue;
    const u = users[i];
    if (!isSyntheticOrgEmail(u.email)) continue;
    promote.push({ u, m: m.toLowerCase() });
  }

  const usedInBatch = new Map();
  for (const { u, m } of promote) {
    if (!usedInBatch.has(m)) usedInBatch.set(m, String(u._id));
  }

  const candidateEmails = [...usedInBatch.keys()];
  if (!candidateEmails.length) {
    return { emailsParsedFromWorkbook, emailsApplied: 0 };
  }

  const inDb = await User.find({
    tenantId,
    email: { $in: candidateEmails },
  })
    .select("_id email")
    .lean();
  const dbOwnerByEmail = new Map(inDb.map((d) => [String(d.email).toLowerCase(), String(d._id)]));

  const appliedIds = new Set();
  for (const { u, m } of promote) {
    if (usedInBatch.get(m) !== String(u._id)) continue;
    const dbOwner = dbOwnerByEmail.get(m);
    if (dbOwner && dbOwner !== String(u._id)) continue;
    u.email = m;
    appliedIds.add(String(u._id));
  }

  return { emailsParsedFromWorkbook, emailsApplied: appliedIds.size };
}

function uniqueUserDocs(users) {
  return [...new Set(users.filter(Boolean))];
}

function pickBest(candidates, empRow) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const subRank = ROLE_RANK[roleOf(empRow.designation) || ""] || 0;
  return [...candidates].sort((a, b) => {
    const ar = ROLE_RANK[roleOf(a.designation) || ""] || 0;
    const br = ROLE_RANK[roleOf(b.designation) || ""] || 0;
    const aOver = ar > subRank ? 1 : 0;
    const bOver = br > subRank ? 1 : 0;
    if (bOver !== aOver) return bOver - aOver;
    const aGap = ar > subRank ? ar - subRank : 99;
    const bGap = br > subRank ? br - subRank : 99;
    if (aGap !== bGap) return aGap - bGap;
    return (a.rowNumber || 1e9) - (b.rowNumber || 1e9);
  })[0];
}

async function discoverRolesForUsers(tenantId, users) {
  const existing = await Role.find({ tenantId }, { aliases: 1 }).lean();
  const aliasIndex = new Map();
  for (const r of existing) {
    for (const a of r.aliases || []) {
      aliasIndex.set(norm(a), r._id);
    }
  }
  const allPerm = await Permission.find({}, { _id: 1 }).lean();
  const permissionIds = allPerm.map((p) => p._id);

  const desigs = [...new Set(users.map((u) => u.designationOverride).filter(Boolean))];
  let createdRoles = 0;
  for (const des of desigs) {
    const key = norm(des);
    if (aliasIndex.has(key)) continue;
    const role = await Role.create({
      tenantId,
      name: titleCase(String(des).trim()),
      type: "CUSTOM",
      permissionIds: pickRandomPermissions(permissionIds),
      aliases: [String(des).trim().toUpperCase()],
      auto: { level: 1, scope: "HQ", detectedAt: new Date() },
      employeeCount: 0,
    });
    aliasIndex.set(key, role._id);
    createdRoles += 1;
  }

  for (const u of users) {
    const des = u.designationOverride;
    if (!des) {
      u.roleIds = [];
      continue;
    }
    const rid = aliasIndex.get(norm(des));
    u.roleIds = rid ? [rid] : [];
  }

  return { createdRoles };
}

async function runOrgWorkbookImport({ tenantId, buffer, filename, actor }) {
  let rows;
  try {
    rows = await parseOrgWorkbookBuffer(buffer);
  } catch (e) {
    throw new ApiError(400, e.message || "Invalid workbook");
  }
  if (!rows.length) {
    throw new ApiError(400, "Workbook has no data rows");
  }

  const importRecord = await Import.create({
    tenantId,
    fileName: filename || "workbook.xlsx",
    totalRows: rows.length,
    createdBy: actor.userId,
    status: "PENDING",
  });

  try {
    const empKeys = [...new Set(rows.filter((r) => r.empId).map((r) => String(r.empId).trim().toUpperCase()))];
    const existing = await User.find({
      tenantId,
      $or: [{ orgFromWorkbook: true }, ...(empKeys.length ? [{ empCode: { $in: empKeys } }] : [])],
    });

    const byEmpId = new Map();
    const byOriginalRow = new Map();
    for (const u of existing) {
      if (u.empCode) byEmpId.set(String(u.empCode).trim().toUpperCase(), u);
      if (u.orgRowNumber != null) byOriginalRow.set(u.orgRowNumber, u);
    }

    const users = [];

    for (const row of rows) {
      let u = null;
      if (row.empId) {
        u = byEmpId.get(String(row.empId).trim().toUpperCase()) || null;
      }
      if (!u && row.rowNumber) {
        u = byOriginalRow.get(row.rowNumber) || null;
      }
      if (!u) {
        const email = workbookEmail({
          tenantId,
          rowNumber: row.rowNumber,
          empId: row.empId,
          name: row.name,
          isVacant: row.isVacant,
        });
        u = new User({
          tenantId,
          status: "INVITED",
          name: row.name || "VACANT",
          email,
        });
      }

      u.tenantId = tenantId;
      u.name = row.name || "VACANT";
      u.orgSeatVacant = row.isVacant;
      u.designationOverride = row.designation || null;
      u.hq = row.hq || null;
      u.zone = row.zone || null;
      u.region = row.region || null;
      u.state = row.state || null;
      u.orgRowNumber = row.rowNumber;
      u.orgSno = row.sno;
      u.doj = row.doj || null;
      u.dob = row.dob || null;
      u.gender = row.gender || null;
      u.reportingManagerRaw = row.reportingManagerRaw || null;
      u.orgFromWorkbook = true;
      u.orgLeftAt = null;

      if (row.isVacant) {
        u.empCode = null;
        u.email = workbookEmail({
          tenantId,
          rowNumber: row.rowNumber,
          empId: null,
          name: "VACANT",
          isVacant: true,
        });
      } else {
        u.empCode = String(row.empId).trim().toUpperCase();
        if (!isSyntheticOrgEmail(u.email)) {
          /* keep real login email */
        } else {
          u.email = workbookEmail({
            tenantId,
            rowNumber: row.rowNumber,
            empId: row.empId,
            name: row.name,
            isVacant: false,
          });
        }
      }

      users.push(u);
    }

    const officialEmailsStored = applyOfficialEmailsFromSheet(users, rows);
    const { emailsParsedFromWorkbook, emailsApplied } = await applyWorkbookSheetEmails(tenantId, users, rows);

    const nameIndex = new Map();
    const roleIndex = new Map();
    const vacantRoleIndex = new Map();

    rows.forEach((r) => {
      const role = roleOf(r.designation);
      if (!r.isVacant && r.name) {
        const k = norm(r.name);
        if (!nameIndex.has(k)) nameIndex.set(k, []);
        nameIndex.get(k).push(r);
        const stripped = norm(stripVacantSuffix(r.name));
        if (stripped && stripped !== k) {
          if (!nameIndex.has(stripped)) nameIndex.set(stripped, []);
          nameIndex.get(stripped).push(r);
        }
        if (role) {
          if (!roleIndex.has(role)) roleIndex.set(role, []);
          roleIndex.get(role).push(r);
        }
      } else if (role) {
        if (!vacantRoleIndex.has(role)) vacantRoleIndex.set(role, []);
        vacantRoleIndex.get(role).push(r);
      }
    });

    let errorCount = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const u = users[i];
      const raw = row.reportingManagerRaw;

      let resolvedRow = null;
      let resolution = "root";

      if (!raw) {
        resolution = "root";
      } else {
        const placeholder = PLACEHOLDER_RE.exec(raw);
        if (placeholder) {
          const vacantRole = placeholder[1].toUpperCase();
          const higher = placeholder[2].toUpperCase();
          resolvedRow =
            pickBest(vacantRoleIndex.get(vacantRole) || [], row) || pickBest(roleIndex.get(higher) || [], row);
          resolution = resolvedRow ? `placeholder->${vacantRole}/${higher}` : "external_root";
        } else {
          for (const candidate of [norm(raw), norm(stripVacantSuffix(raw))]) {
            const hits = nameIndex.get(candidate);
            if (hits && hits.length) {
              resolvedRow = pickBest(hits, row);
              if (resolvedRow) {
                resolution = "name";
                break;
              }
            }
          }
          if (!resolvedRow && raw.trim().toUpperCase().startsWith("VACANT")) {
            resolvedRow = pickBest(roleIndex.get("GM") || [], row);
            resolution = resolvedRow ? "placeholder->GM" : "external_root";
          }
          if (!resolvedRow && resolution !== "placeholder->GM") {
            resolution = "external_root";
          }
        }
      }

      const resolvedIdx = resolvedRow ? rows.indexOf(resolvedRow) : -1;
      const parentId = resolvedIdx >= 0 ? users[resolvedIdx]._id : null;
      if (parentId && String(parentId) === String(u._id)) {
        u.reportingToUserId = null;
        u.managerResolution = "orphan";
      } else {
        u.reportingToUserId = parentId || null;
        u.managerResolution = resolution;
      }

      if (raw && resolution === "external_root") {
        errorCount += 1;
        await ImportError.create({
          importId: importRecord._id,
          rowNumber: row.rowNumber,
          reason: `manager_unresolved: ${raw}`,
          rawData: row,
        });
      }
    }

    const keepIds = users.map((x) => x._id);
    const removeCandidates = await User.find({
      tenantId,
      orgFromWorkbook: true,
      _id: { $nin: keepIds },
    }).select("_id");
    const removeIds = removeCandidates.map((x) => x._id);
    if (removeIds.length) {
      await User.updateMany(
        { tenantId, reportingToUserId: { $in: removeIds } },
        { $set: { reportingToUserId: null } },
      );
      await User.deleteMany({ _id: { $in: removeIds }, tenantId });
    }

    await Promise.all(uniqueUserDocs(users).map((u) => u.save()));

    const { createdRoles } = await discoverRolesForUsers(tenantId, users);
    await Promise.all(uniqueUserDocs(users).map((u) => u.save()));

    let engineSummary = null;
    try {
      engineSummary = await rolesService.recomputeOrgChart(tenantId, actor);
    } catch (engineErr) {
      console.error("org role engine after workbook import failed", engineErr);
    }

    importRecord.successRows = users.length;
    importRecord.failedRows = errorCount;
    importRecord.status = "DONE";
    await importRecord.save();

    const rolesAfter = await Role.countDocuments({ tenantId });

    return {
      importId: importRecord._id,
      rowsParsed: rows.length,
      usersUpserted: users.length,
      positionsCreated: users.length,
      rolesDiscovered: rolesAfter,
      createdRoles,
      errorCount,
      emailsParsedFromWorkbook,
      emailsApplied,
      officialEmailsStored,
      maxLevel: engineSummary?.maxLevel,
      scopes: engineSummary?.scopes,
      summary: engineSummary,
    };
  } catch (err) {
    importRecord.status = "FAILED";
    await importRecord.save();
    throw err;
  }
}

module.exports = { runOrgWorkbookImport };
