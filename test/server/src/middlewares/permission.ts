import type { Response, NextFunction } from 'express';
import type { PermissionKey } from '../config/rbac';
import type { AuthedRequest } from './types';

/**
 * Express middleware factory that gates a route on a permission key.
 * Permissions are seeded from the RBAC table in ``config/rbac.ts``.
 *
 *   router.put('/:id', requirePermission('role.update'), handler)
 */
export function requirePermission(...keys: PermissionKey[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const ok = keys.every((k) => req.auth!.permissions.has(k));
    if (!ok) {
      res.status(403).json({ error: 'forbidden', missing: keys });
      return;
    }
    next();
  };
}
