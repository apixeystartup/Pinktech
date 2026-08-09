import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error';
import { authMiddleware } from './middlewares/auth';
import { tenantMiddleware } from './middlewares/tenant';
import { rolesRouter } from './routes/roles.routes';
import { importsRouter } from './routes/imports.routes';
import { positionsRouter } from './routes/positions.routes';
import { employeesRouter } from './routes/employees.routes';
import { authRouter } from './routes/auth.routes';
import { tenantsRouter } from './routes/tenants.routes';
import { getBootstrap, postReload } from './controllers/bootstrap.controller';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'pink-mern' });
});

// Public bootstrap - creates default tenant + admin on first call and
// returns a JWT. Replaces a "login screen" for local single-user use.
app.get('/api/bootstrap', getBootstrap);

// Tenant + auth bootstrap (open routes - everything else is gated).
app.use('/api/tenants', tenantsRouter);
app.use('/api/auth', authRouter);

// Engine + directory routes - gated by auth + tenant + permission.
app.use('/api/roles', rolesRouter);
app.use('/api/imports', importsRouter);
app.use('/api/positions', positionsRouter);
app.use('/api', employeesRouter);

// Reload uses the original workbook from disk - same auth gate.
app.post('/api/reload', authMiddleware, tenantMiddleware, postReload);

// 404 for unknown routes.
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Centralised error handler.
app.use(errorMiddleware);
