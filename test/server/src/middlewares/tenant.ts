import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from './types';

/**
 * Tenant middleware. Run AFTER ``authMiddleware``. The auth middleware
 * already sets ``req.auth.tenantId`` from the JWT; this middleware just
 * verifies it's present and rejects when it isn't, so every downstream
 * handler can assume a tenant scope without extra null-checks.
 *
 * Mongoose queries elsewhere always include
 * ``{ tenantId: req.auth.tenantId }`` so cross-tenant reads can never leak.
 */
export function tenantMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth || !req.auth.tenantId) {
    res.status(401).json({ error: 'tenant_missing' });
    return;
  }
  next();
}
