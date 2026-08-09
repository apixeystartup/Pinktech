import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';
import { requirePermission } from '../middlewares/permission';
import {
  getAncestryController,
  getEmployeeController,
  getFiltersController,
  getRootsController,
  getStatsController,
  getSubtreeController,
  listEmployeesController,
} from '../controllers/employees.controller';
import {
  getRemoved,
  postEmployee,
  postHierarchyReset,
  postLeave,
  postReassign,
  postReplace,
  postRestore,
  putEmployee,
} from '../controllers/hierarchy.controller';

export const employeesRouter = Router();
employeesRouter.use(authMiddleware, tenantMiddleware);

employeesRouter.get('/employees',                  requirePermission('position.view'),   listEmployeesController);
employeesRouter.post('/employees',                 requirePermission('position.update'), postEmployee);
employeesRouter.get('/employees/:key',             requirePermission('position.view'),   getEmployeeController);
employeesRouter.put('/employees/:key',             requirePermission('position.update'), putEmployee);
employeesRouter.post('/employees/:key/leave',      requirePermission('position.update'), postLeave);
employeesRouter.post('/employees/:key/restore',    requirePermission('position.update'), postRestore);
employeesRouter.post('/employees/:key/replace',    requirePermission('position.update'), postReplace);
employeesRouter.post('/employees/:key/reassign-reports', requirePermission('position.update'), postReassign);
employeesRouter.get('/employees/:key/subtree',     requirePermission('position.view'),   getSubtreeController);
employeesRouter.get('/employees/:key/ancestry',    requirePermission('position.view'),   getAncestryController);

employeesRouter.get('/roots',   requirePermission('position.view'), getRootsController);
employeesRouter.get('/stats',   requirePermission('position.view'), getStatsController);
employeesRouter.get('/filters', requirePermission('position.view'), getFiltersController);

employeesRouter.get('/hierarchy/removed', requirePermission('position.view'),   getRemoved);
employeesRouter.post('/hierarchy/reset',  requirePermission('position.update'), postHierarchyReset);
