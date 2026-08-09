/**
 * Dynamic Role + Level + Scope engine.
 *
 * The six exported functions:
 *
 *   1. discoverRoles      - assign each Position a roleId by alias-matching
 *                           its raw designation (creating new roles when no
 *                           alias hits).
 *   2. inferLevels        - longest-path topological sort over the role graph.
 *   3. inferScope         - mode-of-filled-members per-subtree classification.
 *   4. mergeRoles         - union aliases, repoint Positions, drop the source.
 *   5. effectiveLevel /
 *      effectiveScope     - override > auto resolution (re-exported from the
 *                           Role model).
 *   6. runFor             - orchestrator: discover -> levels -> scope, then
 *                           refresh employeeCount on every Role.
 *
 * Multi-tenant: every function takes a ``tenantId`` and scopes its queries
 * accordingly. Cross-tenant reads are impossible.
 */

import { Types } from 'mongoose';
import { Role, type IRole, type Scope, SCOPES, effectiveLevel, effectiveScope } from '../models/Role';
import { Position, type IPosition } from '../models/Position';
import { addEdge, addNode, emptyGraph, longestDepth } from '../utils/topo';
import { norm, titleCase } from '../utils/norm';
import { isGeographicManagerRole, isNationalOrgScopeRole } from '../utils/orgDesignationScopeHints';

export { effectiveLevel, effectiveScope, SCOPES };
export type { Scope };

// Tunable - mirrors Python's role_engine.SCOPE_THRESHOLDS.
export const SCOPE_THRESHOLDS = {
  allIndiaZoneRatio: 0.75,
};

const SCOPE_ORDER: Record<Scope, number> = {
  HQ: 0,
  AREA: 1,
  REGION: 2,
  ZONE: 3,
  ALL_INDIA: 4,
};

// -----------------------------------------------------------------------------
// 1) Role discovery
// -----------------------------------------------------------------------------

/**
 * Mutates each Position in ``positions`` so that ``position.roleId`` points
 * to a Role with a matching alias. Creates new Role records as needed.
 *
 * Caller is responsible for persisting the Position changes (we batch them
 * after the engine run for efficiency).
 */
export interface RawRow {
  designation: string | null;
  position: IPosition;
}

export async function discoverRoles(
  tenantId: Types.ObjectId,
  rows: RawRow[],
): Promise<{ createdCount: number }> {
  // Alias-id index keyed by normalised designation string. Holds ObjectIds
  // (not full docs) so we don't fight TypeScript over hydrated/lean unions.
  const aliasIndex = new Map<string, Types.ObjectId>();
  const existing = await Role.find({ tenantId }, { aliases: 1 });
  for (const r of existing) {
    for (const a of r.aliases) aliasIndex.set(norm(a), r._id);
  }

  let created = 0;
  for (const { designation, position } of rows) {
    if (!designation) continue;
    const key = norm(designation);
    let roleId = aliasIndex.get(key);
    if (!roleId) {
      const role = await Role.create({
        tenantId,
        name: titleCase(designation.trim()),
        aliases: [designation.trim().toUpperCase()],
        auto: { level: 1, scope: 'HQ', detectedAt: new Date() },
        override: {},
        employeeCount: 0,
      });
      roleId = role._id;
      aliasIndex.set(key, roleId);
      created += 1;
    }
    // Per-employee role overrides survive role discovery: the user pinned
    // this person to a specific role, so we keep their choice even if the
    // raw designation column would map them somewhere else.
    if (!position.roleOverride) {
      position.roleId = roleId;
    }
  }

  return { createdCount: created };
}

// -----------------------------------------------------------------------------
// 2) Level inference
// -----------------------------------------------------------------------------

export async function inferLevels(
  tenantId: Types.ObjectId,
  positions: IPosition[],
  roles: IRole[],
): Promise<void> {
  const posById = new Map<string, IPosition>(positions.map((p) => [String(p._id), p]));
  const graph = emptyGraph();

  for (const role of roles) addNode(graph, String(role._id));

  for (const p of positions) {
    if (!p.roleId) continue;
    const subRole = String(p.roleId);
    if (!p.parentPositionId) continue;
    const parent = posById.get(String(p.parentPositionId));
    if (!parent || !parent.roleId) continue;
    const mgrRole = String(parent.roleId);
    addEdge(graph, mgrRole, subRole);
  }

  const depth = longestDepth(graph);
  let maxDepth = 0;
  for (const d of depth.values()) if (d > maxDepth) maxDepth = d;

  for (const role of roles) {
    const d = depth.get(String(role._id));
    if (d === undefined) continue;
    role.auto.level = maxDepth + 1 - d;
    role.auto.detectedAt = new Date();
  }
}

// -----------------------------------------------------------------------------
// 3) Scope inference
// -----------------------------------------------------------------------------

interface Span { zones: Set<string>; regions: Set<string>; states: Set<string>; hqs: Set<string>; }

function emptySpan(): Span {
  return { zones: new Set(), regions: new Set(), states: new Set(), hqs: new Set() };
}

function collectSubtreeSpan(
  seedId: string,
  childrenByParent: Map<string, string[]>,
  posById: Map<string, IPosition>,
): Span {
  const span = emptySpan();
  const stack = [seedId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = posById.get(id);
    if (!p) continue;
    if (p.zone)   span.zones.add(norm(p.zone));
    if (p.region) span.regions.add(norm(p.region));
    if (p.state)  span.states.add(norm(p.state));
    if (p.hq)     span.hqs.add(norm(p.hq));
    for (const c of childrenByParent.get(id) || []) stack.push(c);
  }
  return span;
}

function classifySpan(span: Span, totalZones: number): Scope {
  const nz = span.zones.size, nr = span.regions.size, ns = span.states.size, nh = span.hqs.size;
  if (totalZones > 0 && nz / totalZones >= SCOPE_THRESHOLDS.allIndiaZoneRatio) return 'ALL_INDIA';
  if (nz > 1) return 'ALL_INDIA';
  if (nz === 1 && nr > 1) return 'ZONE';
  if (nr === 1 && ns > 1) return 'REGION';
  if (ns === 1 && nh > 1) return 'AREA';
  return 'HQ';
}

export async function inferScope(
  tenantId: Types.ObjectId,
  positions: IPosition[],
  roles: IRole[],
): Promise<void> {
  const childrenByParent = new Map<string, string[]>();
  const posById = new Map<string, IPosition>();
  for (const p of positions) {
    posById.set(String(p._id), p);
    if (p.parentPositionId) {
      const key = String(p.parentPositionId);
      const arr = childrenByParent.get(key) || [];
      arr.push(String(p._id));
      childrenByParent.set(key, arr);
    }
  }

  const allZones = new Set<string>();
  for (const p of positions) if (p.zone) allZones.add(norm(p.zone));
  const totalZones = Math.max(1, allZones.size);

  // Roles whose holders sit at the top of the org are pinned to ALL INDIA.
  const rootRoleIds = new Set<string>();
  for (const p of positions) {
    if (!p.parentPositionId && p.roleId) rootRoleIds.add(String(p.roleId));
  }

  const membersByRole = new Map<string, IPosition[]>();
  for (const p of positions) {
    if (!p.roleId) continue;
    const key = String(p.roleId);
    const arr = membersByRole.get(key) || [];
    arr.push(p);
    membersByRole.set(key, arr);
  }

  for (const role of roles) {
    const seeds = membersByRole.get(String(role._id)) || [];
    if (!seeds.length) continue;

    // Same noise filter as the Python engine: prefer filled holders that
    // actually have subordinates - vacant placeholder rows or leaves give
    // misleading single-HQ readings for non-leaf roles.
    let pool = seeds.filter((p) => p.status !== 'VACANT');
    if (!pool.length) pool = seeds;
    const withReports = pool.filter(
      (p) => (childrenByParent.get(String(p._id)) || []).length > 0,
    );
    if (withReports.length) pool = withReports;

    const votes = new Map<Scope, number>();
    for (const p of pool) {
      const span = collectSubtreeSpan(String(p._id), childrenByParent, posById);
      const cls = classifySpan(span, totalZones);
      votes.set(cls, (votes.get(cls) || 0) + 1);
    }

    let winner: Scope = 'HQ';
    let bestVotes = -1;
    let bestOrder = -1;
    for (const [scope, count] of votes) {
      const order = SCOPE_ORDER[scope];
      if (count > bestVotes || (count === bestVotes && order > bestOrder)) {
        winner = scope;
        bestVotes = count;
        bestOrder = order;
      }
    }
    if (rootRoleIds.has(String(role._id)) && !isGeographicManagerRole(role)) {
      winner = 'ALL_INDIA';
    }
    role.auto.scope = winner;
    if (isNationalOrgScopeRole(role)) {
      role.auto.scope = 'ALL_INDIA';
    }
  }
}

// -----------------------------------------------------------------------------
// 4) Merge roles
// -----------------------------------------------------------------------------

export async function mergeRoles(
  tenantId: Types.ObjectId,
  fromId: Types.ObjectId | string,
  intoId: Types.ObjectId | string,
): Promise<IRole | null> {
  if (String(fromId) === String(intoId)) return Role.findOne({ tenantId, _id: intoId });
  const src = await Role.findOne({ tenantId, _id: fromId });
  const dst = await Role.findOne({ tenantId, _id: intoId });
  if (!src || !dst) return null;

  const seen = new Set(dst.aliases.map((a) => a.toUpperCase()));
  for (const a of src.aliases) {
    if (!seen.has(a.toUpperCase())) {
      dst.aliases.push(a);
      seen.add(a.toUpperCase());
    }
  }
  await dst.save();
  await Position.updateMany(
    { tenantId, roleId: src._id },
    { $set: { roleId: dst._id } },
  );
  await src.deleteOne();
  return dst;
}

// -----------------------------------------------------------------------------
// 5) Effective level / scope - re-exported from models/Role.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 6) Orchestrator
// -----------------------------------------------------------------------------

export interface RunSummary {
  roles: number;
  createdRoles: number;
  maxLevel: number;
  scopes: Record<Scope, number>;
}

export async function runFor(tenantId: Types.ObjectId): Promise<RunSummary> {
  // Active positions only (left employees shouldn't influence role
  // inference - their absence is the whole point).
  const positions = await Position.find({ tenantId, leftAt: null });
  const rows: RawRow[] = positions.map((p) => ({
    designation: p.designation || null,
    position: p,
  }));
  const { createdCount } = await discoverRoles(tenantId, rows);
  // Persist any Position whose roleId got assigned during discovery, AND
  // pin originalRoleId on rows that don't have one yet (first import).
  for (const p of positions) {
    if (!p.originalRoleId && p.roleId) p.originalRoleId = p.roleId;
  }
  await Promise.all(positions.map((p) => p.save()));

  // Re-fetch roles as a single hydrated array so the inference passes can
  // mutate + save them.
  const roles = await Role.find({ tenantId });
  await inferLevels(tenantId, positions, roles);
  await inferScope(tenantId, positions, roles);

  // Refresh employeeCount on every role and persist auto values.
  const counts = new Map<string, number>();
  for (const p of positions) {
    if (!p.roleId) continue;
    const k = String(p.roleId);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const r of roles) {
    r.employeeCount = counts.get(String(r._id)) || 0;
  }
  await Promise.all(roles.map((r) => r.save()));

  let maxLevel = 0;
  const scopes: Record<Scope, number> = { ALL_INDIA: 0, ZONE: 0, REGION: 0, AREA: 0, HQ: 0 };
  for (const r of roles) {
    const lvl = effectiveLevel(r);
    if (lvl > maxLevel) maxLevel = lvl;
    scopes[effectiveScope(r)] += 1;
  }

  return {
    roles: roles.length,
    createdRoles: createdCount,
    maxLevel,
    scopes,
  };
}

// -----------------------------------------------------------------------------
// Manual-edit helpers (used by the controllers)
// -----------------------------------------------------------------------------

export async function updateRole(
  tenantId: Types.ObjectId,
  roleId: Types.ObjectId | string,
  patch: {
    name?: string;
    aliases?: string[];
    overrideLevel?: number | null;
    overrideScope?: Scope | null;
    clearOverrides?: boolean;
  },
): Promise<IRole | null> {
  const role = await Role.findOne({ tenantId, _id: roleId });
  if (!role) return null;
  if (patch.name !== undefined) role.name = patch.name.trim() || role.name;
  if (patch.aliases !== undefined) {
    const cleaned = Array.from(
      new Set(patch.aliases.map((a) => a.trim().toUpperCase()).filter(Boolean)),
    );
    role.aliases = cleaned;
  }
  if (patch.clearOverrides) {
    role.override = {};
  } else {
    const ov = role.override || {};
    if (patch.overrideLevel === null) delete ov.level;
    else if (patch.overrideLevel !== undefined) ov.level = patch.overrideLevel;
    if (patch.overrideScope === null) delete ov.scope;
    else if (patch.overrideScope !== undefined && SCOPES.includes(patch.overrideScope)) {
      ov.scope = patch.overrideScope;
    }
    role.override = ov;
  }
  await role.save();
  return role;
}

export async function resetOverrides(
  tenantId: Types.ObjectId,
  roleId: Types.ObjectId | string,
): Promise<IRole | null> {
  const role = await Role.findOne({ tenantId, _id: roleId });
  if (!role) return null;
  role.override = {};
  await role.save();
  return role;
}

export async function createRole(
  tenantId: Types.ObjectId,
  name: string,
  aliases: string[] = [],
): Promise<IRole> {
  return Role.create({
    tenantId,
    name: name.trim(),
    aliases: Array.from(
      new Set(aliases.map((a) => a.trim().toUpperCase()).filter(Boolean)),
    ),
    auto: { level: 1, scope: 'HQ', detectedAt: new Date() },
    override: {},
    employeeCount: 0,
  });
}

export function viewRole(role: IRole) {
  return {
    id: String(role._id),
    name: role.name,
    aliases: role.aliases,
    auto: role.auto,
    override: role.override || {},
    effectiveLevel: effectiveLevel(role),
    effectiveScope: effectiveScope(role),
    employeeCount: role.employeeCount,
  };
}
