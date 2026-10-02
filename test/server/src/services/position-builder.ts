import { Types } from 'mongoose';
import { Position, type IPosition } from '../models/Position';
import { ImportError } from '../models/ImportError';
import { norm, stripVacantSuffix } from '../utils/norm';
import type { ParsedRow } from './xlsx-parser';

/**
 * Convert parsed Excel rows into Position documents and link each to its
 * parent (manager) position.
 *
 * Re-import strategy: we MATCH existing positions by ``empId`` so that a
 * user's manual edits (manager change, role override, person marked as
 * left, manually-added joiner) survive a re-import of the workbook.
 *
 * Manager resolution heuristic mirrors the Python EmployeeService:
 *
 *   1. exact name match (case-insensitive),
 *   2. strip "-Vacant" / "(VACANT)" suffix and retry,
 *   3. "VACANT <ROLE> REPORT TO <HIGHER>" placeholder -> attach to a vacant
 *      row whose designation matches <ROLE>; fall back to a filled employee
 *      whose designation matches <HIGHER>.
 *
 * Anything that fails to resolve is recorded in ImportError and the
 * position becomes a tenant-level root (parentPositionId = null).
 */

const PLACEHOLDER_RE = /^\s*VACANT\s+([A-Z]+)\s+REPORT\s+TO\s+([A-Z]+)\s*$/i;

const ROLE_TOKENS: Record<string, string> = {
  'GENERAL MANAGER': 'GM',
  'SALES MANAGER': 'SM',
  'ZONAL BUSINESS MANAGER': 'ZBM',
  'REGIONAL BUSINESS MANAGER': 'RBM',
  'DEPUTY REGIONAL BUSINESS MANAGER': 'RBM',
  'AREA BUSINESS MANAGER': 'ABM',
  'SENIOR AREA BUSINESS MANAGER': 'ABM',
  'BUSINESS MANAGER': 'BM',
  'TRAINEE BUSINESS MANAGER': 'BM',
};

const ROLE_RANK: Record<string, number> = {
  GM: 6, SM: 5, ZBM: 4, RBM: 3, ABM: 2, BM: 1,
};

function roleOf(designation?: string | null): string | null {
  if (!designation) return null;
  return ROLE_TOKENS[designation.trim().toUpperCase()] || null;
}

interface BuildContext {
  tenantId: Types.ObjectId;
  importId: Types.ObjectId;
}

interface BuildResult {
  positions: IPosition[];
  errorCount: number;
}

/**
 * Build / update positions from parsed rows. Returns the full active
 * position set (existing manually-added rows + workbook rows), with
 * parents resolved and originalParentPositionId pinned for "Reset
 * hierarchy".
 */
export async function buildPositions(
  ctx: BuildContext,
  rows: ParsedRow[],
): Promise<BuildResult> {
  // Existing positions for this tenant - we'll match incoming rows to these
  // by empId so user edits survive a re-import.
  const existing = await Position.find({ tenantId: ctx.tenantId });
  const byEmpId = new Map<string, IPosition>();
  const byOriginalRow = new Map<number, IPosition>();
  for (const p of existing) {
    if (p.empId) byEmpId.set(p.empId.trim().toUpperCase(), p);
    if (p.rowNumber !== null && p.rowNumber !== undefined) {
      byOriginalRow.set(p.rowNumber, p);
    }
  }

  // Pass 1: upsert each row, leaving parent resolution for pass 2.
  // Track positions IN ROW ORDER so the manager-resolution pass can do
  // O(1) name -> position lookups by index.
  const positions: IPosition[] = [];
  const seenIds = new Set<string>();

  for (const row of rows) {
    let pos: IPosition | null = null;
    if (row.empId) {
      pos = byEmpId.get(row.empId.trim().toUpperCase()) || null;
    }
    if (!pos && row.rowNumber) {
      pos = byOriginalRow.get(row.rowNumber) || null;
    }

    if (pos) {
      // Re-import - update non-overridden fields. Geographic / personal
      // fields always come from the latest workbook. Manager + role
      // pointers only change if the user hasn't customised them.
      pos.name = row.name || pos.name;
      pos.designation = row.designation;
      pos.hq = row.hq;
      pos.zone = row.zone;
      pos.region = row.region;
      pos.state = row.state;
      pos.doj = row.doj;
      pos.dob = row.dob;
      pos.gender = row.gender;
      pos.rowNumber = row.rowNumber;
      pos.sno = row.sno;
      pos.reportingManagerRaw = row.reportingManagerRaw;
      pos.isVacant = row.isVacant;
      pos.status = row.isVacant ? 'VACANT' : (pos.leftAt ? 'INACTIVE' : 'ACTIVE');
      // Mark addedManually = false (the row exists in the workbook now).
      pos.addedManually = false;
      // We'll re-derive parent in pass 2 unless the user has overridden.
    } else {
      // Brand-new row - create it.
      pos = new Position({
        tenantId: ctx.tenantId,
        empId: row.empId,
        name: row.name || 'VACANT',
        designation: row.designation,
        rowNumber: row.rowNumber,
        sno: row.sno,
        hq: row.hq,
        zone: row.zone,
        region: row.region,
        state: row.state,
        doj: row.doj,
        dob: row.dob,
        gender: row.gender,
        reportingManagerRaw: row.reportingManagerRaw,
        roleId: null,
        parentPositionId: null,
        originalParentPositionId: null,
        originalRoleId: null,
        status: row.isVacant ? 'VACANT' : 'ACTIVE',
        isVacant: row.isVacant,
        addedManually: false,
        leftAt: null,
        managerOverride: false,
        roleOverride: false,
        managerResolution: 'unresolved',
      });
    }
    positions.push(pos);
    seenIds.add(String(pos._id));
  }

  // Build name index on filled (non-vacant) positions, including a stripped
  // form so "ALICE -Vacant" matches as "ALICE".
  const nameIndex = new Map<string, ParsedRow[]>();
  const roleIndex = new Map<string, ParsedRow[]>();
  const vacantRoleIndex = new Map<string, ParsedRow[]>();

  rows.forEach((r) => {
    const role = roleOf(r.designation);
    if (!r.isVacant && r.name) {
      const k = norm(r.name);
      (nameIndex.get(k) || nameIndex.set(k, []).get(k)!).push(r);
      const stripped = norm(stripVacantSuffix(r.name));
      if (stripped && stripped !== k) {
        (nameIndex.get(stripped) || nameIndex.set(stripped, []).get(stripped)!).push(r);
      }
      if (role) {
        (roleIndex.get(role) || roleIndex.set(role, []).get(role)!).push(r);
      }
    } else if (role) {
      (vacantRoleIndex.get(role) || vacantRoleIndex.set(role, []).get(role)!).push(r);
    }
  });

  function pickBest(candidates: ParsedRow[], emp: ParsedRow): ParsedRow | null {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const subRank = ROLE_RANK[roleOf(emp.designation) || ''] || 0;
    return [...candidates].sort((a, b) => {
      const ar = ROLE_RANK[roleOf(a.designation) || ''] || 0;
      const br = ROLE_RANK[roleOf(b.designation) || ''] || 0;
      const aOver = ar > subRank ? 1 : 0;
      const bOver = br > subRank ? 1 : 0;
      if (bOver !== aOver) return bOver - aOver;
      const aGap = ar > subRank ? ar - subRank : 99;
      const bGap = br > subRank ? br - subRank : 99;
      if (aGap !== bGap) return aGap - bGap;
      return (a.rowNumber || 1e9) - (b.rowNumber || 1e9);
    })[0];
  }

  // Pass 2: derive parent for each row by manager-name resolution, write
  // the result into originalParentPositionId. If the user hasn't
  // overridden the manager (managerOverride === false) we also push it
  // into parentPositionId so the live tree picks up workbook changes.
  const errors: { row: number; message: string; raw: ParsedRow }[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const pos = positions[i];
    const raw = row.reportingManagerRaw;

    let resolvedRow: ParsedRow | null = null;
    let resolution = 'root';

    if (!raw) {
      resolution = 'root';
    } else {
      const placeholder = PLACEHOLDER_RE.exec(raw);
      if (placeholder) {
        const vacantRole = placeholder[1].toUpperCase();
        const higher = placeholder[2].toUpperCase();
        resolvedRow =
          pickBest(vacantRoleIndex.get(vacantRole) || [], row) ||
          pickBest(roleIndex.get(higher) || [], row);
        resolution = resolvedRow
          ? `placeholder->${vacantRole}/${higher}`
          : 'external_root';
      } else {
        for (const candidate of [norm(raw), norm(stripVacantSuffix(raw))]) {
          const hits = nameIndex.get(candidate);
          if (hits && hits.length) {
            resolvedRow = pickBest(hits, row);
            if (resolvedRow) {
              resolution = 'name';
              break;
            }
          }
        }
        if (!resolvedRow && raw.trim().toUpperCase().startsWith('VACANT')) {
          resolvedRow = pickBest(roleIndex.get('GM') || [], row);
          resolution = resolvedRow ? 'placeholder->GM' : 'external_root';
        }
        if (!resolvedRow && resolution !== 'placeholder->GM') {
          resolution = 'external_root';
        }
      }
    }

    const parentId = resolvedRow ? positions[rows.indexOf(resolvedRow)]._id : null;
    pos.originalParentPositionId = parentId;
    if (!pos.managerOverride) {
      pos.parentPositionId = parentId;
      pos.managerResolution = resolution;
    }

    if (raw && resolution === 'external_root') {
      errors.push({
        row: row.rowNumber,
        message: `manager_unresolved: ${raw}`,
        raw: row,
      });
    }
  }

  // Persist - bulk save (insertMany only for new positions, save() for
  // existing). Mongoose ``isNew`` makes this trivial.
  await Promise.all(positions.map((p) => p.save()));

  // Drop positions that were in the DB previously but aren't in the
  // incoming workbook AND weren't manually added. We DO keep ones marked
  // as "left" (addedManually=false but leftAt set) - those represent the
  // user's history. So we only delete legitimate "this row no longer
  // exists in the new workbook" cases.
  const toDelete = existing.filter(
    (p) => !seenIds.has(String(p._id)) && !p.addedManually && !p.leftAt,
  );
  if (toDelete.length) {
    await Position.deleteMany({
      _id: { $in: toDelete.map((p) => p._id) },
      tenantId: ctx.tenantId,
    });
  }

  if (errors.length) {
    await ImportError.insertMany(
      errors.map((e) => ({
        tenantId: ctx.tenantId,
        importId: ctx.importId,
        row: e.row,
        code: 'manager_unresolved',
        message: e.message,
        raw: e.raw as unknown as Record<string, unknown>,
      })),
    );
  }

  return { positions, errorCount: errors.length };
}
