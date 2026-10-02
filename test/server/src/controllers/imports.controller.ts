import type { Response, NextFunction } from 'express';
import { Import } from '../models/Import';
import { ImportError } from '../models/ImportError';
import { runImport } from '../services/import';
import { withAudit } from '../services/audit';
import { AppError } from '../middlewares/error';
import type { AuthedRequest } from '../middlewares/types';

export async function postImport(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('unauthenticated', 401);
    const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
    if (!file) throw new AppError('file_required', 400);

    const result = await withAudit(
      req.auth,
      'import.create',
      { kind: 'import' },
      async () => {
        const out = await runImport({
          tenantId: req.auth!.tenantId,
          filename: file.originalname || 'workbook.xlsx',
          buffer: file.buffer,
          startedBy: req.auth!.userId,
        });
        return {
          before: null,
          after: {
            importId: String(out.importId),
            rowsParsed: out.rowsParsed,
            positionsCreated: out.positionsCreated,
            rolesDiscovered: out.rolesDiscovered,
            errorCount: out.errorCount,
          },
        };
      },
    );
    res.status(201).json({ ok: true, summary: result.after });
  } catch (err) { next(err); }
}

export async function listImports(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('unauthenticated', 401);
    const docs = await Import.find({ tenantId: req.auth.tenantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ imports: docs });
  } catch (err) { next(err); }
}

export async function listImportErrors(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('unauthenticated', 401);
    const docs = await ImportError.find({
      tenantId: req.auth.tenantId,
      importId: req.params.id,
    }).limit(500).lean();
    res.json({ errors: docs });
  } catch (err) { next(err); }
}
