import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';
import { requirePermission } from '../middlewares/permission';
import {
  postImport,
  listImports,
  listImportErrors,
} from '../controllers/imports.controller';

export const importsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

importsRouter.use(authMiddleware, tenantMiddleware);

importsRouter.post('/',          requirePermission('import.create'), upload.single('file'), postImport);
importsRouter.get('/',           requirePermission('import.view'),   listImports);
importsRouter.get('/:id/errors', requirePermission('import.view'),   listImportErrors);
