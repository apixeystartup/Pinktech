import type { Request, Response, NextFunction } from 'express';

/** Custom application error. Throw with a status code from any controller. */
export class AppError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status = 400, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.detail ? { detail: err.detail } : {}),
    });
    return;
  }
  if (err instanceof Error) {
    console.error('[error]', err.stack || err.message);
    res.status(500).json({ error: 'internal_error', detail: err.message });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
}
