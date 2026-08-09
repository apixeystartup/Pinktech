/**
 * Employee directory + hierarchy mutation service.
 *
 * Mirrors the Python EmployeeService API but reads/writes Mongoose
 * documents instead of an in-memory list. For each request we pull a
 * full snapshot of the tenant's active positions + roles into memory
 * (a few hundred docs at most), then run the read APIs (list, subtree,
 * ancestry, stats, filters) over that snapshot.
 *
 * Mutations write directly to the Position docs and flip the override
 * flags so a subsequent re-import preserves them.
 */

import { Types, type FilterQuery } from 'mongoose';
import { Position, type IPosition } from '../models/Position';
import { Role, type IRole, effectiveLevel, effectiveScope } from '../models/Role';
import { norm } from '../utils/norm';
import { runFor } from './role-engine';
import { AppError } from '../middlewares/error';

// ---------------------------------------------------------------------------
// Snapshot / view shapes
// ---------------------------------------------------------------------------

export interface Snapshot {
  tenantId: Types.ObjectId;
  positions: IPosition[];
  byId: Map<string, IPosition>;
  byEmpId: Map<string, IPosition>;
  childrenByParent: Map<string, string[]>;
  roleById: Map<string, IRole>;
  maxLevel: number;
}

export interface EmpView {
  id: string;
  emp_id: string | null;
  name: string;
  designation: string | null;
  role_id: string | null;
  role_name: string;
  level: number;
  scope: string;
  hq: string | null;
  zone: string | null;
  region: string | null;
  state: string | null;
  doj: string | null;
  dob: string | null;
  gender: string | null;
  is_vacant: boolean;
  added_manually: boolean;
  manager_id: string | null;
  manager_resolution: string;
  reporting_manager_raw: string | null;
  external_manager: string | null;
  direct_reports: number;
  manager: {
    id: string;
    name: string;
    emp_id: string | null;
    designation: string | null;
    role_name: string;
  } | null;
  role: { id: string; name: string; level: number; scope: string } | null;
}

const PLACEHOLDER_RE = /^\s*VACANT\s+([A-Z]+)\s+REPORT\s+TO\s+([A-Z]+)\s*$/i;
const GEOGRAPHY_FIELDS = ['zone', 'region', 'state', 'hq'] as const;
type GeoField = typeof GEOGRAPHY_FIELDS[number];

// ---------------------------------------------------------------------------
// Snapshot loader
// ---------------------------------------------------------------------------

export async function loadSnapshot(tenantId: Types.ObjectId): Promise<Snapshot> {
  const [positions, roles] = await Promise.all([
    Position.find({ tenantId, leftAt: null }),
    Role.find({ tenantId }),
  ]);

  const byId = new Map<string, IPosition>();
  const byEmpId = new Map<string, IPosition>();
  const childrenByParent = new Map<string, string[]>();
  for (const p of positions) {
    const id = String(p._id);
    byId.set(id, p);
    if (p.empId) byEmpId.set(p.empId.trim().toUpperCase(), p);
    const parentKey = p.parentPositionId ? String(p.parentPositionId) : '__root__';
    const arr = childrenByParent.get(parentKey) || [];
    arr.push(id);
    childrenByParent.set(parentKey, arr);
  }

  // Sort children: filled first, then by name.
  for (const [k, ids] of childrenByParent.entries()) {
    ids.sort((a, b) => {
      const A = byId.get(a)!;
      const B = byId.get(b)!;
      const av = A.isVacant ? 1 : 0;
      const bv = B.isVacant ? 1 : 0;
      if (av !== bv) return av - bv;
      return (A.name || '').localeCompare(B.name || '');
    });
    childrenByParent.set(k, ids);
  }

  const roleById = new Map<string, IRole>(roles.map((r) => [String(r._id), r]));
  let maxLevel = 1;
  for (const r of roles) {
    const lvl = effectiveLevel(r);
    if (lvl > maxLevel) maxLevel = lvl;
  }

  return { tenantId, positions, byId, byEmpId, childrenByParent, roleById, maxLevel };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function findInSnapshot(snap: Snapshot, key: string): IPosition | null {
  if (!key) return null;
  const direct = snap.byId.get(key);
  if (direct) return direct;
  const byEmp = snap.byEmpId.get(key.trim().toUpperCase());
  if (byEmp) return byEmp;
  // Fall back: try ObjectId equality (some clients pass _id). Already
  // covered by byId, but try name-match as a last resort.
  const target = key.trim().toLowerCase();
  for (const p of snap.positions) {
    if ((p.name || '').toLowerCase() === target) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enrich
// ---------------------------------------------------------------------------

export function enrich(snap: Snapshot, p: IPosition): EmpView {
  const role = p.roleId ? snap.roleById.get(String(p.roleId)) || null : null;
  const manager = p.parentPositionId
    ? snap.byId.get(String(p.parentPositionId)) || null
    : null;
  const childrenIds = snap.childrenByParent.get(String(p._id)) || [];
  const externalManager =
    !manager &&
    p.reportingManagerRaw &&
    !PLACEHOLDER_RE.test(p.reportingManagerRaw) &&
    p.managerResolution === 'external_root'
      ? p.reportingManagerRaw
      : null;
  return {
    id: String(p._id),
    emp_id: p.empId,
    name: p.name,
    designation: p.designation,
    role_id: role ? String(role._id) : null,
    role_name: role ? role.name : (p.designation || 'Unspecified'),
    level: role ? effectiveLevel(role) : 1,
    scope: role ? effectiveScope(role) : 'HQ',
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
          role_name: manager.roleId
            ? snap.roleById.get(String(manager.roleId))?.name || (manager.designation || '')
            : (manager.designation || ''),
        }
      : null,
    role: role
      ? {
          id: String(role._id),
          name: role.name,
          level: effectiveLevel(role),
          scope: effectiveScope(role),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Filter / list
// ---------------------------------------------------------------------------

export interface ListParams {
  q?: string | null;
  zone?: string | null;
  region?: string | null;
  state?: string | null;
  hq?: string | null;
  designation?: string | null;
  roleId?: string | null;
  level?: string | number | null;
  manager?: string | null;
  vacantOnly?: boolean;
  filledOnly?: boolean;
  strictGeography?: boolean;
  limit?: number | null;
}

interface Criteria {
  zone?: string | null;
  region?: string | null;
  state?: string | null;
  hq?: string | null;
  designation?: string | null;
  roleId?: string | null;
  level?: string | number | null;
}

function levelOf(snap: Snapshot, p: IPosition): number {
  if (!p.roleId) return 1;
  const r = snap.roleById.get(String(p.roleId));
  return r ? effectiveLevel(r) : 1;
}

function scopeOf(snap: Snapshot, p: IPosition): string {
  if (!p.roleId) return 'HQ';
  const r = snap.roleById.get(String(p.roleId));
  return r ? effectiveScope(r) : 'HQ';
}

function applyCriteria(
  snap: Snapshot,
  items: IPosition[],
  criteria: Criteria,
  opts: { skip?: keyof Criteria; strictGeography?: boolean } = {},
): IPosition[] {
  const skip = opts.skip;
  const strictGeo = !!opts.strictGeography;
  let out = items;

  for (const field of ['zone', 'region', 'state', 'hq'] as GeoField[]) {
    if (skip === field) continue;
    const v = criteria[field];
    if (!v) continue;
    const target = norm(v);
    out = out.filter(
      (p) =>
        (!strictGeo && scopeOf(snap, p) === 'ALL_INDIA') ||
        norm(p[field]) === target,
    );
  }

  if (skip !== 'designation' && criteria.designation) {
    const target = norm(criteria.designation);
    out = out.filter((p) => norm(p.designation) === target);
  }
  if (skip !== 'roleId' && criteria.roleId) {
    out = out.filter((p) => p.roleId && String(p.roleId) === criteria.roleId);
  }
  if (skip !== 'level' && criteria.level !== undefined && criteria.level !== null && criteria.level !== '') {
    const target = Number(criteria.level);
    if (!Number.isNaN(target)) {
      out = out.filter((p) => levelOf(snap, p) === target);
    }
  }
  return out;
}

export function listEmployees(snap: Snapshot, params: ListParams): EmpView[] {
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
    const role = (p: IPosition) => {
      if (!p.roleId) return '';
      return snap.roleById.get(String(p.roleId))?.name || '';
    };
    items = items.filter((p) =>
      [
        p.name,
        p.empId,
        p.reportingManagerRaw,
        p.designation,
        role(p),
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
    return (a.name || '').localeCompare(b.name || '');
  });

  if (params.limit) items = items.slice(0, params.limit);
  return items.map((p) => enrich(snap, p));
}

// ---------------------------------------------------------------------------
// Subtree / ancestry / roots
// ---------------------------------------------------------------------------

export interface SubtreeNode extends EmpView {
  children: SubtreeNode[];
  depth: number;
  total_descendants: number;
}

export function subtree(snap: Snapshot, rootKey: string): SubtreeNode | null {
  const root = findInSnapshot(snap, rootKey);
  if (!root) return null;
  const build = (id: string, depth: number): SubtreeNode => {
    const p = snap.byId.get(id)!;
    const childIds = snap.childrenByParent.get(id) || [];
    const children = childIds.map((cid) => build(cid, depth + 1));
    const node: SubtreeNode = {
      ...enrich(snap, p),
      children,
      depth,
      direct_reports: children.length,
      total_descendants: children.reduce(
        (sum, c) => sum + 1 + c.total_descendants,
        0,
      ),
    };
    return node;
  };
  return build(String(root._id), 0);
}

export function ancestry(snap: Snapshot, key: string): EmpView[] {
  const start = findInSnapshot(snap, key);
  if (!start) return [];
  const path: EmpView[] = [];
  const seen = new Set<string>();
  let cursor: IPosition | null = start;
  while (cursor && !seen.has(String(cursor._id))) {
    seen.add(String(cursor._id));
    path.push(enrich(snap, cursor));
    cursor = cursor.parentPositionId
      ? snap.byId.get(String(cursor.parentPositionId)) || null
      : null;
  }
  return path.reverse();
}

export function roots(snap: Snapshot): EmpView[] {
  const ids = snap.childrenByParent.get('__root__') || [];
  return ids.map((id) => enrich(snap, snap.byId.get(id)!));
}

// ---------------------------------------------------------------------------
// Stats / filters
// ---------------------------------------------------------------------------

export function stats(snap: Snapshot) {
  const total = snap.positions.length;
  const vacant = snap.positions.filter((p) => p.isVacant).length;
  const filled = total - vacant;

  const byZone: Record<string, number> = {};
  const byDesignation: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byLevel: Record<string, number> = {};

  for (const p of snap.positions) {
    if (p.zone) byZone[p.zone] = (byZone[p.zone] || 0) + 1;
    if (p.designation) byDesignation[p.designation] = (byDesignation[p.designation] || 0) + 1;
    const roleName = p.roleId ? snap.roleById.get(String(p.roleId))?.name : null;
    if (roleName) byRole[roleName] = (byRole[roleName] || 0) + 1;
    const lvl = String(levelOf(snap, p));
    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
  }

  const rootIds = snap.childrenByParent.get('__root__') || [];

  return {
    total,
    filled,
    vacant,
    unresolved: snap.positions.filter((p) => p.managerResolution === 'orphan').length,
    roots: rootIds.length,
    roles: snap.roleById.size,
    max_level: snap.maxLevel,
    by_zone: byZone,
    by_designation: byDesignation,
    by_role: byRole,
    by_level: Object.fromEntries(
      Object.entries(byLevel).sort(([a], [b]) => Number(a) - Number(b)),
    ),
  };
}

export interface FilterParams {
  zone?: string | null;
  region?: string | null;
  state?: string | null;
  hq?: string | null;
  designation?: string | null;
  roleId?: string | null;
  level?: string | number | null;
  strictGeography?: boolean;
}

export function cascadingFilters(snap: Snapshot, params: FilterParams) {
  const criteria: Criteria = {
    zone: params.zone,
    region: params.region,
    state: params.state,
    hq: params.hq,
    designation: params.designation,
    roleId: params.roleId,
    level: params.level,
  };

  function options(field: 'zone' | 'region' | 'state' | 'hq' | 'designation') {
    const scope = applyCriteria(snap, snap.positions, criteria, {
      skip: field,
      strictGeography: params.strictGeography,
    });
    const counts = new Map<string, number>();
    for (const p of scope) {
      const v = p[field];
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([value, count]) => ({ value, count }));
  }

  function levelOptions() {
    const scope = applyCriteria(snap, snap.positions, criteria, {
      skip: 'level',
      strictGeography: params.strictGeography,
    });
    const counts = new Map<number, number>();
    for (const p of scope) {
      const lvl = levelOf(snap, p);
      counts.set(lvl, (counts.get(lvl) || 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([value, count]) => ({ value, count }));
  }

  // Roles facet
  const roleScope = applyCriteria(snap, snap.positions, criteria, {
    skip: 'roleId',
    strictGeography: params.strictGeography,
  });
  const roleCounts = new Map<string, number>();
  for (const p of roleScope) {
    if (!p.roleId) continue;
    const k = String(p.roleId);
    roleCounts.set(k, (roleCounts.get(k) || 0) + 1);
  }
  const rolesFacet: Array<{ value: string; label: string; level: number; scope: string; count: number }> = [];
  for (const [id, role] of snap.roleById) {
    const c = roleCounts.get(id);
    if (!c) continue;
    rolesFacet.push({
      value: id,
      label: role.name || 'Unspecified',
      level: effectiveLevel(role),
      scope: effectiveScope(role),
      count: c,
    });
  }
  rolesFacet.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    return (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase());
  });

  return {
    zones: options('zone'),
    regions: options('region'),
    states: options('state'),
    hqs: options('hq'),
    designations: options('designation'),
    roles: rolesFacet,
    levels: levelOptions(),
    max_level: snap.maxLevel,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function detectCycle(
  tenantId: Types.ObjectId,
  subjectId: string,
  candidateId: string | null,
): Promise<boolean> {
  if (!candidateId) return false;
  if (candidateId === subjectId) return true;
  // Walk up from candidate. If we hit subject, candidate is a descendant.
  const seen = new Set<string>();
  let current: string | null = candidateId;
  while (current && !seen.has(current)) {
    if (current === subjectId) return true;
    seen.add(current);
    const doc: { parentPositionId: Types.ObjectId | null } | null = await Position.findOne(
      { tenantId, _id: current },
      { parentPositionId: 1 },
    ).lean();
    if (!doc) break;
    current = doc.parentPositionId ? String(doc.parentPositionId) : null;
  }
  return false;
}

export async function setManager(
  tenantId: Types.ObjectId,
  subjectId: string,
  managerId: string | null,
): Promise<EmpView> {
  if (!Types.ObjectId.isValid(subjectId)) throw new AppError('not_found', 404);
  const subject = await Position.findOne({ tenantId, _id: subjectId });
  if (!subject) throw new AppError('not_found', 404);
  if (managerId) {
    if (!Types.ObjectId.isValid(managerId)) throw new AppError('manager_not_found', 404);
    const mgr = await Position.findOne({ tenantId, _id: managerId, leftAt: null });
    if (!mgr) throw new AppError('manager_not_found', 404);
    if (await detectCycle(tenantId, subjectId, managerId)) {
      throw new AppError('cycle_detected', 400);
    }
  }
  subject.parentPositionId = managerId ? new Types.ObjectId(managerId) : null;
  subject.managerOverride = true;
  subject.managerResolution = 'manual_override';
  await subject.save();
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, snap.byId.get(String(subject._id))!);
}

export async function setRole(
  tenantId: Types.ObjectId,
  subjectId: string,
  roleId: string,
): Promise<EmpView> {
  if (!Types.ObjectId.isValid(subjectId)) throw new AppError('not_found', 404);
  if (!Types.ObjectId.isValid(roleId)) throw new AppError('role_not_found', 404);
  const subject = await Position.findOne({ tenantId, _id: subjectId });
  if (!subject) throw new AppError('not_found', 404);
  const role = await Role.findOne({ tenantId, _id: roleId });
  if (!role) throw new AppError('role_not_found', 404);
  subject.roleId = role._id;
  subject.roleOverride = true;
  await subject.save();
  // Refresh role employee counts.
  await runFor(tenantId).catch(() => null);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, snap.byId.get(String(subject._id))!);
}

export interface AddEmployeeInput {
  name: string;
  emp_id?: string | null;
  designation?: string | null;
  role_id?: string | null;
  manager_id?: string | null;
  hq?: string | null;
  zone?: string | null;
  region?: string | null;
  state?: string | null;
  doj?: string | null;
  dob?: string | null;
  gender?: string | null;
  is_vacant?: boolean;
}

export async function addEmployee(
  tenantId: Types.ObjectId,
  payload: AddEmployeeInput,
): Promise<EmpView> {
  const name = (payload.name || '').trim();
  if (!name) throw new AppError('name_required', 400);

  let roleId: Types.ObjectId | null = null;
  let designation = (payload.designation || '').trim() || null;
  if (payload.role_id) {
    if (!Types.ObjectId.isValid(payload.role_id)) throw new AppError('role_not_found', 404);
    const role = await Role.findOne({ tenantId, _id: payload.role_id });
    if (!role) throw new AppError('role_not_found', 404);
    roleId = role._id;
    if (!designation) designation = role.name;
  }

  let managerId: Types.ObjectId | null = null;
  if (payload.manager_id) {
    if (!Types.ObjectId.isValid(payload.manager_id)) throw new AppError('manager_not_found', 404);
    const mgr = await Position.findOne({ tenantId, _id: payload.manager_id, leftAt: null });
    if (!mgr) throw new AppError('manager_not_found', 404);
    managerId = mgr._id;
  }

  const empId = (payload.emp_id || '').trim() || null;
  const pos = await Position.create({
    tenantId,
    empId,
    name,
    designation,
    rowNumber: null,
    sno: null,
    hq: payload.hq ?? null,
    zone: payload.zone ?? null,
    region: payload.region ?? null,
    state: payload.state ?? null,
    doj: payload.doj ?? null,
    dob: payload.dob ?? null,
    gender: payload.gender ?? null,
    reportingManagerRaw: null,
    roleId,
    parentPositionId: managerId,
    originalParentPositionId: managerId,
    originalRoleId: roleId,
    status: payload.is_vacant ? 'VACANT' : 'ACTIVE',
    isVacant: !!payload.is_vacant,
    addedManually: true,
    leftAt: null,
    managerOverride: !!managerId,
    roleOverride: !!roleId,
    managerResolution: 'manual_added',
  });

  // Refresh role engine if roleId was set (employee count moved).
  if (roleId) await runFor(tenantId).catch(() => null);

  const snap = await loadSnapshot(tenantId);
  return enrich(snap, snap.byId.get(String(pos._id))!);
}

export async function reassignReports(
  tenantId: Types.ObjectId,
  fromId: string,
  toId: string | null,
  reportIds?: string[],
): Promise<{ moved: number; from: string; to: string | null }> {
  if (!Types.ObjectId.isValid(fromId)) throw new AppError('not_found', 404);
  const from = await Position.findOne({ tenantId, _id: fromId });
  if (!from) throw new AppError('not_found', 404);
  if (toId && !Types.ObjectId.isValid(toId)) throw new AppError('target_not_found', 404);
  if (toId === fromId) throw new AppError('cannot_reassign_to_self', 400);
  if (toId) {
    const to = await Position.findOne({ tenantId, _id: toId, leftAt: null });
    if (!to) throw new AppError('target_not_found', 404);
  }

  const filter: FilterQuery<IPosition> = {
    tenantId,
    parentPositionId: from._id,
    leftAt: null,
  };
  if (reportIds && reportIds.length) {
    filter._id = { $in: reportIds.filter((r) => Types.ObjectId.isValid(r)) };
  }
  const reports = await Position.find(filter);
  let moved = 0;
  for (const r of reports) {
    if (toId && (await detectCycle(tenantId, String(r._id), toId))) continue;
    r.parentPositionId = toId ? new Types.ObjectId(toId) : null;
    r.managerOverride = true;
    r.managerResolution = 'manual_override';
    await r.save();
    moved += 1;
  }
  return { moved, from: fromId, to: toId };
}

export async function markLeft(
  tenantId: Types.ObjectId,
  subjectId: string,
  reassignTo: string | null = null,
): Promise<{ removed: string; reports_moved: number; to: string | null }> {
  if (!Types.ObjectId.isValid(subjectId)) throw new AppError('not_found', 404);
  const subject = await Position.findOne({ tenantId, _id: subjectId });
  if (!subject) throw new AppError('not_found', 404);

  let target = reassignTo;
  if (target === undefined || target === null) {
    target = subject.parentPositionId ? String(subject.parentPositionId) : null;
  }
  if (target === subjectId) target = null;

  // Move children first.
  let moved = 0;
  if (target !== null) {
    const result = await reassignReports(tenantId, subjectId, target);
    moved = result.moved;
  } else {
    // Orphan the children (set parent = null).
    const result = await reassignReports(tenantId, subjectId, null);
    moved = result.moved;
  }

  subject.leftAt = new Date();
  subject.status = 'INACTIVE';
  await subject.save();

  // Refresh role counts.
  await runFor(tenantId).catch(() => null);

  return { removed: subjectId, reports_moved: moved, to: target };
}

export async function restoreEmployee(
  tenantId: Types.ObjectId,
  subjectId: string,
): Promise<EmpView> {
  if (!Types.ObjectId.isValid(subjectId)) throw new AppError('not_found', 404);
  const subject = await Position.findOne({ tenantId, _id: subjectId });
  if (!subject) throw new AppError('not_found', 404);
  subject.leftAt = null;
  subject.status = subject.isVacant ? 'VACANT' : 'ACTIVE';
  await subject.save();
  await runFor(tenantId).catch(() => null);
  const snap = await loadSnapshot(tenantId);
  return enrich(snap, snap.byId.get(String(subject._id))!);
}

export interface RemovedSnapshot {
  id: string;
  emp_id: string | null;
  name: string;
  designation: string | null;
  role_name: string | null;
  hq: string | null;
  zone: string | null;
  region: string | null;
  state: string | null;
  last_manager_name: string | null;
  direct_reports: number;
  left_at: string;
}

export async function removedPeople(
  tenantId: Types.ObjectId,
): Promise<RemovedSnapshot[]> {
  const left = await Position.find({ tenantId, leftAt: { $ne: null } }).sort({ leftAt: -1 });
  if (!left.length) return [];

  // Resolve last manager + role names from a single fetch.
  const mgrIds = left
    .map((p) => p.parentPositionId)
    .filter(Boolean) as Types.ObjectId[];
  const managers = await Position.find({
    _id: { $in: mgrIds },
    tenantId,
  });
  const mgrById = new Map(managers.map((m) => [String(m._id), m]));
  const roles = await Role.find({ tenantId });
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  // Direct-reports count: count active reports whose parent points to this id.
  const childCounts = await Position.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        tenantId,
        leftAt: null,
        parentPositionId: { $in: left.map((p) => p._id) },
      },
    },
    { $group: { _id: '$parentPositionId', n: { $sum: 1 } } },
  ]);
  const childCountById = new Map(childCounts.map((c) => [String(c._id), c.n]));

  return left.map((p) => {
    const mgr = p.parentPositionId ? mgrById.get(String(p.parentPositionId)) : null;
    const role = p.roleId ? roleById.get(String(p.roleId)) : null;
    return {
      id: String(p._id),
      emp_id: p.empId,
      name: p.name,
      designation: p.designation,
      role_name: role ? role.name : null,
      hq: p.hq,
      zone: p.zone,
      region: p.region,
      state: p.state,
      last_manager_name: mgr ? mgr.name : null,
      direct_reports: childCountById.get(String(p._id)) || 0,
      left_at: (p.leftAt as Date).toISOString(),
    };
  });
}

export async function replacePerson(
  tenantId: Types.ObjectId,
  subjectId: string,
  payload: AddEmployeeInput,
): Promise<{ replaced: string; new_employee: EmpView; reports_moved: number }> {
  if (!Types.ObjectId.isValid(subjectId)) throw new AppError('not_found', 404);
  const subject = await Position.findOne({ tenantId, _id: subjectId });
  if (!subject) throw new AppError('not_found', 404);

  // 1) Add the new employee under subject's manager, defaulting geography
  //    + role from subject when caller didn't specify.
  const newPayload: AddEmployeeInput = {
    name: payload.name,
    emp_id: payload.emp_id,
    designation: payload.designation || subject.designation,
    role_id: payload.role_id || (subject.roleId ? String(subject.roleId) : null),
    manager_id: subject.parentPositionId ? String(subject.parentPositionId) : null,
    hq: payload.hq ?? subject.hq,
    zone: payload.zone ?? subject.zone,
    region: payload.region ?? subject.region,
    state: payload.state ?? subject.state,
    doj: payload.doj ?? null,
    dob: payload.dob ?? null,
    gender: payload.gender ?? null,
    is_vacant: false,
  };
  const newEmp = await addEmployee(tenantId, newPayload);

  // 2) Move every direct report under the new employee.
  const reassign = await reassignReports(tenantId, subjectId, newEmp.id);

  // 3) Mark subject as left.
  await markLeft(tenantId, subjectId, newEmp.id);

  return { replaced: subjectId, new_employee: newEmp, reports_moved: reassign.moved };
}

export async function resetHierarchy(
  tenantId: Types.ObjectId,
): Promise<{ ok: true; total: number }> {
  // Step 1: purge addedManually positions (they never existed in the workbook).
  await Position.deleteMany({ tenantId, addedManually: true });
  // Step 2: restore everyone (clear leftAt) and reset overrides.
  await Position.updateMany(
    { tenantId },
    {
      $set: { leftAt: null, managerOverride: false, roleOverride: false, managerResolution: 'name' },
    },
  );
  // Step 3: copy originalParentPositionId / originalRoleId back into the
  // live fields. Do per-doc since $set with $field-ref needs aggregation
  // pipeline updates - simpler to just iterate.
  const positions = await Position.find({ tenantId });
  for (const p of positions) {
    p.parentPositionId = p.originalParentPositionId;
    if (p.originalRoleId) p.roleId = p.originalRoleId;
    p.status = p.isVacant ? 'VACANT' : 'ACTIVE';
    await p.save();
  }
  await runFor(tenantId).catch(() => null);
  const total = await Position.countDocuments({ tenantId, leftAt: null });
  return { ok: true, total };
}

export async function resetAllRoles(
  tenantId: Types.ObjectId,
): Promise<{ roles: number; max_level: number }> {
  // Save the per-employee role overrides we want to keep.
  const overrides = await Position.find(
    { tenantId, roleOverride: true, leftAt: null },
    { _id: 1, roleId: 1 },
  );
  const overrideMap = new Map(
    overrides.map((p) => [String(p._id), p.roleId ? String(p.roleId) : null]),
  );

  // Wipe the roles registry.
  await Role.deleteMany({ tenantId });
  await Position.updateMany({ tenantId }, { $set: { roleId: null, originalRoleId: null } });

  // Re-discover.
  await runFor(tenantId);

  // Re-apply per-employee role overrides where the role still exists.
  for (const [posId, oldRoleId] of overrideMap) {
    if (!oldRoleId) continue;
    // The role with that _id no longer exists - try to find the new role
    // whose alias matches the position's designation. Simpler: re-find a
    // role whose name/aliases match the position's designation.
    const pos = await Position.findById(posId);
    if (!pos) continue;
    const role = pos.designation
      ? await Role.findOne({
          tenantId,
          aliases: pos.designation.trim().toUpperCase(),
        })
      : null;
    if (role) {
      pos.roleId = role._id;
      pos.roleOverride = true;
      await pos.save();
    }
  }
  await runFor(tenantId);
  const roles = await Role.find({ tenantId });
  let maxLevel = 1;
  for (const r of roles) {
    const lvl = effectiveLevel(r);
    if (lvl > maxLevel) maxLevel = lvl;
  }
  return { roles: roles.length, max_level: maxLevel };
}
