import type { Response, NextFunction } from 'express';
import { Position } from '../models/Position';
import { Role } from '../models/Role';
import { effectiveLevel, effectiveScope } from '../services/role-engine';
import { AppError } from '../middlewares/error';
import type { AuthedRequest } from '../middlewares/types';

/**
 * Legacy positions endpoint kept for compatibility with the original Track B
 * tooling. The org-explorer in the React app uses /api/employees instead.
 */
export async function listPositions(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('unauthenticated', 401);
    const { tenantId } = req.auth;
    const filter: Record<string, unknown> = { tenantId, leftAt: null };
    for (const f of ['zone', 'region', 'state', 'hq'] as const) {
      const v = req.query[f];
      if (typeof v === 'string' && v) filter[f] = v;
    }
    if (typeof req.query.roleId === 'string' && req.query.roleId) {
      filter.roleId = req.query.roleId;
    }
    if (typeof req.query.status === 'string' && req.query.status) {
      filter.status = req.query.status;
    }
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const positions = await Position.find(filter).limit(limit).lean();
    const roles = await Role.find({ tenantId }).lean();
    const roleById = new Map(roles.map((r) => [String(r._id), r]));

    const items = positions.map((p) => {
      const role = p.roleId ? roleById.get(String(p.roleId)) : null;
      return {
        id: String(p._id),
        empId: p.empId,
        name: p.name,
        designation: p.designation,
        roleId: p.roleId ? String(p.roleId) : null,
        role: role
          ? {
              id: String(role._id),
              name: role.name,
              level: effectiveLevel(role),
              scope: effectiveScope(role),
            }
          : null,
        parentPositionId: p.parentPositionId ? String(p.parentPositionId) : null,
        hq: p.hq,
        zone: p.zone,
        region: p.region,
        state: p.state,
        status: p.status,
        isVacant: p.isVacant,
        addedManually: p.addedManually,
      };
    });

    res.json({ count: items.length, items });
  } catch (err) { next(err); }
}
