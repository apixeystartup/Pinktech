import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';
import { requirePermission } from '../middlewares/permission';
import {
  getRole,
  listRoles,
  postAutoDetect,
  postMerge,
  postReset,
  postResetAll,
  postRole,
  putRole,
} from '../controllers/roles.controller';

export const rolesRouter = Router();

rolesRouter.use(authMiddleware, tenantMiddleware);

rolesRouter.get('/',                requirePermission('role.view'),        listRoles);
rolesRouter.post('/',               requirePermission('role.create'),      postRole);
rolesRouter.post('/auto-detect',    requirePermission('role.auto_detect'), postAutoDetect);
rolesRouter.post('/reset-all',      requirePermission('role.update'),      postResetAll);
rolesRouter.post('/merge',          requirePermission('role.merge'),       postMerge);
rolesRouter.get('/:id',             requirePermission('role.view'),        getRole);
rolesRouter.put('/:id',             requirePermission('role.update'),      putRole);
rolesRouter.post('/:id/reset',      requirePermission('role.update'),      postReset);
