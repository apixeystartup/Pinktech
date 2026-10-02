import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';
import { requirePermission } from '../middlewares/permission';
import { listPositions } from '../controllers/positions.controller';

export const positionsRouter = Router();
positionsRouter.use(authMiddleware, tenantMiddleware);
positionsRouter.get('/', requirePermission('position.view'), listPositions);
