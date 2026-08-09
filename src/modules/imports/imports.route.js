const express = require("express");
const XLSX = require("xlsx");
const upload = require("../../middlewares/upload.middleware");
const Import = require("../../models/import.model");
const ImportError = require("../../models/importError.model");
const Role = require("../../models/role.model");
const User = require("../../models/user.model");
const Permission = require("../../models/permission.model");
const Assignment = require("../../models/assignment.model");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const ApiError = require("../../common/errors/ApiError");
const rolesService = require("../roles/roles.service");

const router = express.Router();

const HEADER_ALIASES = {
  name: ["name", "employee name", "name of the employees", "employee", "full name", "person name"],
  email: ["email", "email id", "offic email id", "mail", "work email", "official email"],
  /** Avoid bare "id" — it fuzzy-matches "Manager ID" and breaks EMP vs manager columns. */
  empCode: ["emp code", "employee code", "employee id", "emp id", "staff id", "associate id", "worker id"],
  roleName: ["role", "role name", "designation", "job role", "title"],
  /** Multiple roles in one cell: "Role A; Role B" or comma-separated */
  rolesList: ["roles", "role names", "all roles", "assigned roles", "rbac roles"],
  reportsToEmpCode: [
    "reporting person",
    "reports to person",
    "reporting officer",
    "reporting manager",
    "immediate manager",
    "functional manager",
    "l1 manager",
    "line manager",
    "reports to emp",
    "reports to emp code",
    "manager emp",
    "manager emp code",
    "manager employee id",
    "reporting manager emp",
    "reports to employee id",
    "reporting manager id",
    "manager id",
    "supervisor id",
    "supervisor emp",
    "supervisor emp code",
    "reports to id",
    "parent emp",
    "parent emp code",
    "parent employee id",
  ],
  reportsToEmail: [
    "reports to email",
    "manager email",
    "reporting manager email",
    "reports to mail",
    "supervisor email",
    "reports to manager email",
  ],
  zone: ["zone", "sales zone", "zonal"],
  region: ["region", "regional"],
  state: ["state", "province"],
  hq: ["hq", "headquarters", "branch", "location"],
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/** Excel often returns employee ids as numbers; normalize for consistent storage and lookup. */
function normalizeEmpCodeCell(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  return String(value).trim();
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sheet often lists only "subbramani" while import email is slugged from full name:
 * "K SUBBRAMANI" -> k.subbramani.i7@import.local — match hint as a dot-separated local-part segment.
 */
function emailLocalHintRegex(localHint) {
  const h = String(localHint || "")
    .trim()
    .toLowerCase();
  if (!h || h.includes("@") || h.length < 2) {
    return null;
  }
  const e = escapeRegex(h);
  return new RegExp(`(?:^|\\.)${e}(?:\\.|@)`, "i");
}

/** Surname / token in "K SUBBRAMANI", "SUBBRAMANI, K", etc. */
function reportingNameTokenRegex(token) {
  const t = String(token || "").trim();
  if (!t || /\s/.test(t) || t.length < 2) {
    return null;
  }
  return new RegExp(`(^|[\\s,;])${escapeRegex(t)}($|[\\s,;,])`, "i");
}

async function findUserByEmailLocalHint(tenantId, localHint, disambigNameToken) {
  const re = emailLocalHintRegex(localHint);
  if (!re) {
    return null;
  }
  const list = await User.find({ tenantId, email: re }).select("_id email name").limit(25).lean();
  if (list.length === 0) {
    return null;
  }
  if (list.length === 1) {
    return User.findById(list[0]._id);
  }
  const tokenRe = reportingNameTokenRegex(disambigNameToken);
  if (tokenRe) {
    const narrowed = list.filter((u) => tokenRe.test(u.name || ""));
    if (narrowed.length === 1) {
      return User.findById(narrowed[0]._id);
    }
  }
  return null;
}

async function findUserByEmpCode(tenantId, raw) {
  const primary = normalizeEmpCodeCell(raw);
  if (!primary) {
    return null;
  }
  let u = await User.findOne({ tenantId, empCode: primary });
  if (u) {
    return u;
  }
  if (/^\d+$/.test(primary)) {
    const asNumber = String(Number(primary));
    if (asNumber !== primary) {
      u = await User.findOne({ tenantId, empCode: asNumber });
      if (u) {
        return u;
      }
    }
    const noLeadingZeros = primary.replace(/^0+/, "") || "0";
    if (noLeadingZeros !== primary) {
      u = await User.findOne({ tenantId, empCode: noLeadingZeros });
      if (u) {
        return u;
      }
    }
  }
  u = await User.findOne({
    tenantId,
    empCode: { $regex: new RegExp(`^${escapeRegex(primary)}$`, "i") },
  });
  return u || null;
}

/**
 * Dedicated email column first, then the "reporting person" cell (EMP, email, or full name as in the sheet).
 * Supports: full email, local-part only (matches subbramani.i3@import.local), surname/token in name.
 */
async function resolveReportingManager(tenantId, row) {
  const emailDirect = row.reportsToEmail ? String(row.reportsToEmail).trim().toLowerCase() : "";
  const raw = row.reportsToEmpCode ? String(row.reportsToEmpCode).trim() : "";
  const nameTokenFromReportingCell = raw && !/\s/.test(raw) && raw.length >= 2 ? raw : "";

  if (emailDirect) {
    const byEmail = await User.findOne({ tenantId, email: emailDirect });
    if (byEmail) {
      return byEmail;
    }
    if (!emailDirect.includes("@")) {
      const byLocal = await findUserByEmailLocalHint(tenantId, emailDirect, nameTokenFromReportingCell);
      if (byLocal) {
        return byLocal;
      }
    }
  }

  if (!raw) {
    return null;
  }

  let u = await findUserByEmpCode(tenantId, raw);
  if (u) {
    return u;
  }

  if (raw.includes("@")) {
    u = await User.findOne({ tenantId, email: raw.toLowerCase().trim() });
    if (u) {
      return u;
    }
  } else {
    u = await findUserByEmailLocalHint(tenantId, raw.toLowerCase(), null);
    if (u) {
      return u;
    }
  }

  const collapsed = raw.replace(/\s+/g, " ").trim();
  const nameExact = new RegExp(`^${escapeRegex(collapsed)}$`, "i");
  u = await User.findOne({ tenantId, name: nameExact });
  if (u) {
    return u;
  }

  if (!/\s/.test(collapsed) && collapsed.length >= 2) {
    const tokenRe = reportingNameTokenRegex(collapsed);
    if (tokenRe) {
      const candidates = await User.find({ tenantId, name: tokenRe }).select("_id email name").limit(25).lean();
      if (candidates.length === 1) {
        return User.findById(candidates[0]._id);
      }
      if (candidates.length > 1 && emailDirect && !emailDirect.includes("@")) {
        const hintRe = emailLocalHintRegex(emailDirect);
        if (hintRe) {
          const narrowed = candidates.filter((c) => hintRe.test(String(c.email || "")));
          if (narrowed.length === 1) {
            return User.findById(narrowed[0]._id);
          }
        }
      }
    }
  }

  return null;
}

function pickHeader(headerMap, aliases) {
  for (const alias of aliases) {
    const key = headerMap.get(normalizeHeader(alias));
    if (key) {
      return key;
    }
  }
  for (const [normalized, original] of headerMap.entries()) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      if (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        return original;
      }
    }
  }
  return null;
}

function parseWorkbookRows(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ApiError(400, "Excel file has no sheets");
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  if (!rows.length) {
    throw new ApiError(400, "Excel sheet is empty");
  }
  return rows;
}

function parseRoleNamesFromCell(value) {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  return String(value)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapImportRows(rows) {
  const firstRow = rows[0] || {};
  const rowKeys = Object.keys(firstRow);
  const headerMap = new Map(rowKeys.map((key) => [normalizeHeader(key), key]));

  const nameKey = pickHeader(headerMap, HEADER_ALIASES.name);
  const emailKey = pickHeader(headerMap, HEADER_ALIASES.email);
  const empCodeKey = pickHeader(headerMap, HEADER_ALIASES.empCode);
  const roleNameKey = pickHeader(headerMap, HEADER_ALIASES.roleName);
  const rolesListKey = pickHeader(headerMap, HEADER_ALIASES.rolesList);
  const reportsToEmpKey = pickHeader(headerMap, HEADER_ALIASES.reportsToEmpCode);
  const reportsToEmailKey = pickHeader(headerMap, HEADER_ALIASES.reportsToEmail);
  const zoneKey = pickHeader(headerMap, HEADER_ALIASES.zone);
  const regionKey = pickHeader(headerMap, HEADER_ALIASES.region);
  const stateKey = pickHeader(headerMap, HEADER_ALIASES.state);
  const hqKey = pickHeader(headerMap, HEADER_ALIASES.hq);

  if (!nameKey) {
    throw new ApiError(400, "Excel must contain a name column");
  }

  const pickedHeaders = {
    name: nameKey,
    email: emailKey || null,
    empCode: empCodeKey || null,
    role: roleNameKey || rolesListKey || null,
    reportingPerson: reportsToEmpKey || null,
    reportingEmail: reportsToEmailKey || null,
  };

  const parsed = rows.map((row) => {
    const fromList = rolesListKey ? parseRoleNamesFromCell(row[rolesListKey]) : [];
    const fromSingle = roleNameKey ? parseRoleNamesFromCell(row[roleNameKey]) : [];
    const roleNames = [...new Set([...fromList, ...fromSingle].map((r) => r.trim()).filter(Boolean))];

    return {
      name: normalizeCell(row[nameKey]),
      email: emailKey ? normalizeCell(row[emailKey]).toLowerCase() : "",
      empCode: empCodeKey ? normalizeEmpCodeCell(row[empCodeKey]) : "",
      roleNames,
      reportsToEmpCode: reportsToEmpKey ? normalizeEmpCodeCell(row[reportsToEmpKey]) : "",
      reportsToEmail: reportsToEmailKey ? normalizeCell(row[reportsToEmailKey]).toLowerCase() : "",
      zone: zoneKey ? normalizeCell(row[zoneKey]) : "",
      region: regionKey ? normalizeCell(row[regionKey]) : "",
      state: stateKey ? normalizeCell(row[stateKey]) : "",
      hq: hqKey ? normalizeCell(row[hqKey]) : "",
      rawData: row,
    };
  });

  return { rows: parsed, pickedHeaders };
}

function pickRandomPermissions(permissionIds) {
  if (!permissionIds.length) {
    return [];
  }
  const shuffled = [...permissionIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = Math.max(1, Math.ceil(shuffled.length * 0.4));
  return shuffled.slice(0, count);
}

function buildFallbackEmail(row, rowNumber) {
  const source = row.empCode || row.name || `employee-${rowNumber}`;
  const localPart =
    String(source)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || `employee-${rowNumber}`;
  // Without a real email, one synthetic address per sheet row — avoids merging distinct people
  // (which made reporting updates look "missing" on the wrong user).
  const disambig = row.email ? "" : `.i${rowNumber}`;
  return `${localPart}${disambig}@import.local`;
}

async function ensureRoles(tenantId, roleNames) {
  const roleByName = new Map();
  const existing = await Role.find({ tenantId, name: { $in: roleNames } });
  for (const role of existing) {
    roleByName.set(role.name.toLowerCase(), role);
  }

  const allPermissions = await Permission.find({}, { _id: 1 });
  const permissionIds = allPermissions.map((permission) => permission._id);

  for (const name of roleNames) {
    const key = name.toLowerCase();
    if (roleByName.has(key)) {
      continue;
    }
    const role = await Role.create({
      tenantId,
      name,
      type: "CUSTOM",
      permissionIds: pickRandomPermissions(permissionIds),
      aliases: [name.trim().toUpperCase()],
      auto: { level: 1, scope: "HQ", detectedAt: new Date() },
      employeeCount: 0,
    });
    roleByName.set(key, role);
  }

  return roleByName;
}

router.post(
  "/employees",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware("employee.assign"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ApiError(400, "File is required");
      }

      const { rows: parsedRows, pickedHeaders } = mapImportRows(parseWorkbookRows(req.file.buffer));
      const importRecord = await Import.create({
        tenantId: req.tenantId,
        fileName: req.file.originalname,
        totalRows: parsedRows.length,
        createdBy: req.auth.userId,
        status: "PENDING",
      });

      const roleNames = new Set();
      for (const row of parsedRows) {
        for (const rn of row.roleNames) {
          roleNames.add(rn);
        }
      }

      const roleByName = await ensureRoles(req.tenantId, [...roleNames]);

      let successRows = 0;
      let failedRows = 0;
      let reportingLinked = 0;
      let reportingSkipped = 0;

      for (let i = 0; i < parsedRows.length; i += 1) {
        const row = parsedRows[i];
        if (!row.name) {
          failedRows += 1;
          await ImportError.create({
            importId: importRecord._id,
            rowNumber: i + 1,
            reason: "Missing required name",
            rawData: row,
          });
          continue;
        }

        const roleIdsResolved = row.roleNames
          .map((rn) => roleByName.get(rn.toLowerCase())?._id)
          .filter(Boolean);
        const email = row.email || buildFallbackEmail(row, i + 1);

        const set = {
          tenantId: req.tenantId,
          name: row.name,
          email,
        };
        if (row.empCode) {
          set.empCode = row.empCode;
        }
        if (roleIdsResolved.length) {
          set.roleIds = roleIdsResolved;
        }
        if (row.zone) set.zone = row.zone;
        if (row.region) set.region = row.region;
        if (row.state) set.state = row.state;
        if (row.hq) set.hq = row.hq;

        const unsetDoc = {
          ...(row.empCode ? {} : { empCode: 1 }),
          currentPositionId: 1,
        };

        let userDoc = null;
        try {
          if (row.empCode) {
            const byEmp = await findUserByEmpCode(req.tenantId, row.empCode);
            if (byEmp) {
              const emailTaken = await User.findOne({
                tenantId: req.tenantId,
                email,
                _id: { $ne: byEmp._id },
              });
              if (emailTaken) {
                failedRows += 1;
                await ImportError.create({
                  importId: importRecord._id,
                  rowNumber: i + 1,
                  reason: `EMP ${row.empCode} is already on another user; this row's email ${email} belongs to a different person`,
                  rawData: row,
                });
                continue;
              }
              userDoc = await User.findOneAndUpdate(
                { _id: byEmp._id, tenantId: req.tenantId },
                { $set: set, $unset: unsetDoc },
                { new: true },
              );
            }
          }

          if (!userDoc) {
            userDoc = await User.findOneAndUpdate(
              { tenantId: req.tenantId, email },
              {
                $set: set,
                $unset: unsetDoc,
                $setOnInsert: { status: "INVITED" },
              },
              { upsert: true, new: true },
            );
          }
        } catch (err) {
          if (err && err.code === 11000) {
            failedRows += 1;
            await ImportError.create({
              importId: importRecord._id,
              rowNumber: i + 1,
              reason:
                "Duplicate EMP ID or email: another user in this tenant already has this EMP or this email. Remove duplicates in Excel or run DB index fix (see fixUserEmpCodeIndex.js).",
              rawData: row,
            });
            continue;
          }
          throw err;
        }

        if (userDoc?._id) {
          await Assignment.updateMany(
            { tenantId: req.tenantId, userId: userDoc._id, isCurrent: true },
            { $set: { isCurrent: false, activeTo: new Date() } },
          );
        }

        successRows += 1;
      }

      for (let i = 0; i < parsedRows.length; i += 1) {
        const row = parsedRows[i];
        if (!row.name) {
          continue;
        }
        const email = row.email || buildFallbackEmail(row, i + 1);
        let employee = await User.findOne({ tenantId: req.tenantId, email });
        if (!employee && row.empCode) {
          employee = await findUserByEmpCode(req.tenantId, row.empCode);
        }
        if (!employee) {
          continue;
        }

        const wantsReport = Boolean(row.reportsToEmpCode || row.reportsToEmail);
        if (!wantsReport) {
          continue;
        }

        const manager = await resolveReportingManager(req.tenantId, row);

        if (!manager) {
          reportingSkipped += 1;
          await ImportError.create({
            importId: importRecord._id,
            rowNumber: i + 1,
            reason: `Reporting manager not found (cell: ${row.reportsToEmpCode || "—"}, email col: ${row.reportsToEmail || "—"})`,
            rawData: row.rawData || row,
          });
          continue;
        }
        if (String(manager._id) === String(employee._id)) {
          reportingSkipped += 1;
          await ImportError.create({
            importId: importRecord._id,
            rowNumber: i + 1,
            reason: "Employee cannot report to themselves",
            rawData: row.rawData || row,
          });
          continue;
        }

        await User.updateOne({ _id: employee._id, tenantId: req.tenantId }, { $set: { reportingToUserId: manager._id } });
        reportingLinked += 1;
      }

      importRecord.successRows = successRows;
      importRecord.failedRows = failedRows;
      importRecord.status = "DONE";
      await importRecord.save();

      try {
        await rolesService.recomputeOrgChart(req.tenantId, req.auth);
      } catch (engineErr) {
        console.error("org role engine after import failed", engineErr);
      }

      const reportingHints =
        reportingSkipped > 0
          ? await ImportError.find({
              importId: importRecord._id,
              reason: { $regex: /reporting|report to themselves/i },
            })
              .sort({ rowNumber: 1 })
              .limit(12)
              .select("rowNumber reason")
              .lean()
          : [];

      res.status(201).json({
        import: importRecord,
        pickedHeaders,
        inferred: {
          roleCount: roleNames.size,
          reportingLinksApplied: reportingLinked,
          reportingRowsSkipped: reportingSkipped,
        },
        reportingHints,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
