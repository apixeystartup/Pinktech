import { Router } from 'express';
import { registerTenant } from '../controllers/tenants.controller';

export const tenantsRouter = Router();

// Open route: bootstraps a tenant + owner user. In production this would be
// hidden behind an internal admin token; for the engine POC any caller can
// create their own tenant.
tenantsRouter.post('/register', registerTenant);
