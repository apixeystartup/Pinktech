/**
 * Read-side endpoints for the org explorer:
 * /api/employees, /api/stats, /api/filters, /api/roots, plus subtree +
 * ancestry lookups. Every handler runs against the live tenant snapshot.
 */

import type { Response, NextFunction } from 'express';
import { AppError } from '../middlewares/error';
import type { AuthedRequest } from '../middlewares/types';
import {
  ancestry as ancestryFn,
  cascadingFilters,
  enrich,
  findInSnapshot,
  listEmployees,
  loadSnapshot,
  roots as rootsFn,
  stats as statsFn,
  subtree as subtreeFn,
  type ListParams,
} from '../services/employee.service';

function ctx(req: AuthedRequest) {
  if (!req.auth) throw new AppError('unauthenticated', 401);
  return req.auth;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}
function asBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

export async function listEmployeesController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    const params: ListParams = {
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
      limit: req.query.limit ? Number(req.query.limit) : 200,
    };
    const items = listEmployees(snap, params);
    res.json({ count: items.length, items });
  } catch (err) { next(err); }
}

export async function getEmployeeController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    const p = findInSnapshot(snap, req.params.key);
    if (!p) throw new AppError('not_found', 404);
    res.json({ employee: enrich(snap, p) });
  } catch (err) { next(err); }
}

export async function getSubtreeController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    const tree = subtreeFn(snap, req.params.key);
    if (!tree) throw new AppError('not_found', 404);
    res.json({ root: tree });
  } catch (err) { next(err); }
}

export async function getAncestryController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    const path = ancestryFn(snap, req.params.key);
    if (!path.length) throw new AppError('not_found', 404);
    res.json({ ancestry: path });
  } catch (err) { next(err); }
}

export async function getRootsController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    res.json({ roots: rootsFn(snap) });
  } catch (err) { next(err); }
}

export async function getStatsController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    res.json(statsFn(snap));
  } catch (err) { next(err); }
}

export async function getFiltersController(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const snap = await loadSnapshot(c.tenantId);
    res.json(
      cascadingFilters(snap, {
        zone: asStr(req.query.zone),
        region: asStr(req.query.region),
        state: asStr(req.query.state),
        hq: asStr(req.query.hq),
        designation: asStr(req.query.designation),
        roleId: asStr(req.query.role_id),
        level: asStr(req.query.level),
        strictGeography: asBool(req.query.strict_geography),
      }),
    );
  } catch (err) { next(err); }
}
