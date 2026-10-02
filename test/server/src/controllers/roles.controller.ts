import type { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Role, SCOPES, type Scope } from '../models/Role';
import {
  createRole,
  mergeRoles,
  resetOverrides,
  runFor,
  updateRole,
  viewRole,
} from '../services/role-engine';
import { resetAllRoles } from '../services/employee.service';
import { withAudit } from '../services/audit';
import { AppError } from '../middlewares/error';
import type { AuthedRequest } from '../middlewares/types';

function ctx(req: AuthedRequest) {
  if (!req.auth) throw new AppError('unauthenticated', 401);
  return req.auth;
}

export async function listRoles(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId } = ctx(req);
    const docs = await Role.find({ tenantId }).sort({ 'auto.level': -1, name: 1 });
    res.json({ roles: docs.map(viewRole) });
  } catch (err) { next(err); }
}

export async function getRole(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId } = ctx(req);
    if (!Types.ObjectId.isValid(req.params.id)) throw new AppError('not_found', 404);
    const role = await Role.findOne({ tenantId, _id: req.params.id });
    if (!role) throw new AppError('not_found', 404);
    res.json({ role: viewRole(role) });
  } catch (err) { next(err); }
}

export async function postRole(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const { name, aliases } = req.body || {};
    if (!name || typeof name !== 'string') throw new AppError('name_required', 400);
    if (aliases !== undefined && !Array.isArray(aliases)) {
      throw new AppError('aliases_must_be_array', 400);
    }
    const result = await withAudit(
      c,
      'role.create',
      { kind: 'role' },
      async () => {
        const role = await createRole(c.tenantId, name, aliases || []);
        return { before: null, after: viewRole(role), created: role };
      },
    );
    res.status(201).json({ role: result.after });
  } catch (err) { next(err); }
}

export async function putRole(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    if (!Types.ObjectId.isValid(req.params.id)) throw new AppError('not_found', 404);
    const before = await Role.findOne({ tenantId: c.tenantId, _id: req.params.id });
    if (!before) throw new AppError('not_found', 404);

    const { name, aliases, override, clear_overrides: clearOverrides } = req.body || {};
    if (aliases !== undefined && !Array.isArray(aliases)) {
      throw new AppError('aliases_must_be_array', 400);
    }
    let overrideLevel: number | null | undefined;
    let overrideScope: Scope | null | undefined;
    if (override && typeof override === 'object') {
      if (override.level === null) overrideLevel = null;
      else if (override.level !== undefined) overrideLevel = Number(override.level);
      if (override.scope === null) overrideScope = null;
      else if (override.scope !== undefined) {
        if (!SCOPES.includes(override.scope)) throw new AppError('invalid_scope', 400);
        overrideScope = override.scope as Scope;
      }
    }

    const result = await withAudit(
      c,
      'role.update',
      { kind: 'role', id: String(before._id) },
      async () => {
        const beforeView = viewRole(before);
        const updated = await updateRole(c.tenantId, before._id, {
          name,
          aliases,
          overrideLevel,
          overrideScope,
          clearOverrides: !!clearOverrides,
        });
        return { before: beforeView, after: updated ? viewRole(updated) : null };
      },
    );
    res.json({ role: result.after });
  } catch (err) { next(err); }
}

export async function postReset(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    if (!Types.ObjectId.isValid(req.params.id)) throw new AppError('not_found', 404);
    const before = await Role.findOne({ tenantId: c.tenantId, _id: req.params.id });
    if (!before) throw new AppError('not_found', 404);

    const result = await withAudit(
      c,
      'role.reset',
      { kind: 'role', id: String(before._id) },
      async () => {
        const beforeView = viewRole(before);
        const updated = await resetOverrides(c.tenantId, before._id);
        return { before: beforeView, after: updated ? viewRole(updated) : null };
      },
    );
    res.json({ role: result.after });
  } catch (err) { next(err); }
}

export async function postAutoDetect(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const result = await withAudit(
      c,
      'role.auto_detect',
      { kind: 'tenant', id: String(c.tenantId) },
      async () => {
        const summary = await runFor(c.tenantId);
        return { before: null, after: summary };
      },
    );
    res.json({ ok: true, ...result.after });
  } catch (err) { next(err); }
}

export async function postResetAll(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const result = await withAudit(
      c,
      'role.reset_all',
      { kind: 'tenant', id: String(c.tenantId) },
      async () => {
        const after = await resetAllRoles(c.tenantId);
        return { before: null, after };
      },
    );
    res.json({ ok: true, ...result.after });
  } catch (err) { next(err); }
}

export async function postMerge(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const c = ctx(req);
    const { from_id: fromId, into_id: intoId } = req.body || {};
    if (!fromId || !intoId) throw new AppError('from_and_into_required', 400);
    if (!Types.ObjectId.isValid(fromId) || !Types.ObjectId.isValid(intoId)) {
      throw new AppError('invalid_id', 400);
    }
    const before = await Role.findOne({ tenantId: c.tenantId, _id: fromId });
    const target = await Role.findOne({ tenantId: c.tenantId, _id: intoId });
    if (!before || !target) throw new AppError('not_found', 404);

    const result = await withAudit(
      c,
      'role.merge',
      { kind: 'role', id: String(intoId) },
      async () => {
        const beforeView = { from: viewRole(before), into: viewRole(target) };
        const survivor = await mergeRoles(c.tenantId, fromId, intoId);
        // Re-run inference - levels can shift.
        await runFor(c.tenantId);
        const reloaded = survivor && (await Role.findOne({ tenantId: c.tenantId, _id: survivor._id }));
        return { before: beforeView, after: reloaded ? viewRole(reloaded) : null };
      },
    );
    res.json({ role: result.after });
  } catch (err) { next(err); }
}
