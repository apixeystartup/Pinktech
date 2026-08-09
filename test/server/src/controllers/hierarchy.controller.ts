/**
 * Mutation endpoints for the org tree:
 *   - PUT  /api/employees/:key                  set manager and/or role
 *   - POST /api/employees                       add a manually-created person
 *   - POST /api/employees/:key/leave            mark as left + reassign reports
 *   - POST /api/employees/:key/restore          un-left a person
 *   - POST /api/employees/:key/replace          atomic "X left, Y joined" flow
 *   - POST /api/employees/:key/reassign-reports move direct reports elsewhere
 *   - GET  /api/hierarchy/removed               list left people
 *   - POST /api/hierarchy/reset                 wipe every override
 */

import type { Response, NextFunction } from 'express';
import { AppError } from '../middlewares/error';
import { withAudit } from '../services/audit';
import {
  addEmployee,
  enrich,
  findInSnapshot,
  loadSnapshot,
  markLeft,
  reassignReports,
  removedPeople,
  replacePerson,
  resetHierarchy,
  restoreEmployee,
  setManager,
  setRole,
  type AddEmployeeInput,
} from '../services/employee.service';
import type { AuthedRequest } from '../middlewares/types';

function ctx(req: AuthedRequest) {
  if (!req.auth) throw new AppError('unauthenticated', 401);
  return req.auth;
}

async function resolveSubjectId(
  req: AuthedRequest,
): Promise<string> {
  const c = ctx(req);
  const snap = await loadSnapshot(c.tenantId);
  const p = findInSnapshot(snap, req.params.key);
  if (!p) throw new AppError('not_found', 404);
  return String(p._id);
}

export async function putEmployee(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const subjectId = await resolveSubjectId(req);
    const { manager_id: managerId, role_id: roleId } = req.body || {};

    const result = await withAudit(
      c,
      'employee.update',
      { kind: 'position', id: subjectId },
      async () => {
        let after = null;
        if (managerId !== undefined) {
          after = await setManager(c.tenantId, subjectId, managerId || null);
        }
        if (roleId !== undefined) {
          after = await setRole(c.tenantId, subjectId, roleId);
        }
        return { before: null, after };
      },
    );
    res.json({ employee: result.after });
  } catch (err) { next(err); }
}

export async function postEmployee(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const payload = (req.body || {}) as AddEmployeeInput;
    const result = await withAudit(
      c,
      'employee.create',
      { kind: 'position' },
      async () => {
        const after = await addEmployee(c.tenantId, payload);
        return { before: null, after };
      },
    );
    res.status(201).json({ employee: result.after });
  } catch (err) { next(err); }
}

export async function postReassign(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const fromId = await resolveSubjectId(req);
    const { to_id: toIdRaw, report_ids: reportIds } = req.body || {};
    let toId: string | null = toIdRaw || null;
    if (toId) {
      const snap = await loadSnapshot(c.tenantId);
      const target = findInSnapshot(snap, toId);
      if (!target) throw new AppError('target_not_found', 404);
      toId = String(target._id);
    }

    const result = await withAudit(
      c,
      'employee.reassign_reports',
      { kind: 'position', id: fromId },
      async () => {
        const after = await reassignReports(c.tenantId, fromId, toId, reportIds);
        return { before: null, after };
      },
    );
    res.json(result.after);
  } catch (err) { next(err); }
}

export async function postLeave(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const subjectId = await resolveSubjectId(req);
    const { reassign_to: reassignToRaw } = req.body || {};
    let reassignTo: string | null | undefined = reassignToRaw;
    if (reassignTo) {
      const snap = await loadSnapshot(c.tenantId);
      const target = findInSnapshot(snap, reassignTo);
      if (!target) throw new AppError('target_not_found', 404);
      reassignTo = String(target._id);
    }
    const result = await withAudit(
      c,
      'employee.leave',
      { kind: 'position', id: subjectId },
      async () => {
        const after = await markLeft(c.tenantId, subjectId, reassignTo as string | null | undefined ?? null);
        return { before: null, after };
      },
    );
    res.json(result.after);
  } catch (err) { next(err); }
}

export async function postRestore(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    // Restore needs to find the position even though it's filtered out of
    // the active snapshot (leftAt != null). Look it up by _id directly.
    const subjectId = req.params.key;
    const result = await withAudit(
      c,
      'employee.restore',
      { kind: 'position', id: subjectId },
      async () => {
        const after = await restoreEmployee(c.tenantId, subjectId);
        return { before: null, after };
      },
    );
    res.json({ employee: result.after });
  } catch (err) { next(err); }
}

export async function postReplace(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const subjectId = await resolveSubjectId(req);
    const payload = (req.body || {}) as AddEmployeeInput;

    const result = await withAudit(
      c,
      'employee.replace',
      { kind: 'position', id: subjectId },
      async () => {
        const after = await replacePerson(c.tenantId, subjectId, payload);
        return { before: null, after };
      },
    );
    res.json(result.after);
  } catch (err) { next(err); }
}

export async function getRemoved(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const items = await removedPeople(c.tenantId);
    res.json({ count: items.length, items });
  } catch (err) { next(err); }
}

export async function postHierarchyReset(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const result = await withAudit(
      c,
      'hierarchy.reset',
      { kind: 'tenant', id: String(c.tenantId) },
      async () => {
        const after = await resetHierarchy(c.tenantId);
        return { before: null, after };
      },
    );
    res.json(result.after);
  } catch (err) { next(err); }
}

export async function getEmployeeEnriched(
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
