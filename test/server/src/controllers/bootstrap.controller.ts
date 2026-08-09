import type { Request, Response, NextFunction } from 'express';
import { ensureBootstrap, reloadDefaultWorkbook } from '../services/bootstrap';
import { AppError } from '../middlewares/error';
import type { AuthedRequest } from '../middlewares/types';

/**
 * GET /api/bootstrap - public endpoint. Idempotent. Returns a JWT for the
 * default admin (creating the tenant + user + first import on the very
 * first call). The React client calls this on first load, stashes the
 * token in localStorage, and uses it for every subsequent request.
 */
export async function getBootstrap(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (process.env.DISABLE_BOOTSTRAP === '1') {
      throw new AppError('bootstrap_disabled', 403);
    }
    const result = await ensureBootstrap();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reload - re-imports SAMPLE ORG (1).xlsx for the current tenant.
 * Authenticated.
 */
export async function postReload(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('unauthenticated', 401);
    const result = await reloadDefaultWorkbook({
      tenantId: req.auth.tenantId,
      startedBy: req.auth.userId,
    });
    if (!result.imported) {
      throw new AppError('workbook_not_found', 404);
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}
