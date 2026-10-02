/**
 * First-run / dev-mode bootstrap.
 *
 * The very first request to ``GET /api/bootstrap`` does two things:
 *
 *   1) creates a ``default`` tenant + an ``admin@local`` owner user if
 *      neither exists yet (idempotent on every subsequent call), and
 *   2) auto-imports ``SAMPLE ORG (1).xlsx`` from the project root if the
 *      tenant has zero positions yet.
 *
 * It then returns a fresh JWT for that owner so the React client can
 * stash it in localStorage and use it for every subsequent call. Net
 * effect: the app opens straight to the directory with no login screen.
 *
 * Production deployments can disable this route by setting
 * ``DISABLE_BOOTSTRAP=1`` in their .env - the rest of the auth code path
 * (login, invites, RBAC) is unaffected.
 */

import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Position } from '../models/Position';
import { Import } from '../models/Import';
import { runImport } from './import';
import { signToken } from '../middlewares/auth';

export const DEFAULT_TENANT_SLUG = 'default';
export const DEFAULT_TENANT_NAME = 'Default Org';
export const DEFAULT_ADMIN_EMAIL = 'admin@local';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

// SAMPLE ORG (1).xlsx lives at the project root (one level above server/).
const SAMPLE_WORKBOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'SAMPLE ORG (1).xlsx',
);

export interface BootstrapResult {
  token: string;
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string; roles: string[] };
  imported: boolean;
  positions: number;
  roles: number;
  workbookPath: string | null;
}

export async function ensureBootstrap(): Promise<BootstrapResult> {
  // 1) Tenant
  let tenant = await Tenant.findOne({ slug: DEFAULT_TENANT_SLUG });
  if (!tenant) {
    tenant = await Tenant.create({ name: DEFAULT_TENANT_NAME, slug: DEFAULT_TENANT_SLUG });
  }

  // 2) Owner user
  let user = await User.findOne({
    tenantId: tenant._id,
    email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
  });
  if (!user) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    user = await User.create({
      tenantId: tenant._id,
      email: DEFAULT_ADMIN_EMAIL,
      passwordHash,
      fullName: 'Default Admin',
      roles: ['owner'],
      status: 'ACTIVE',
    });
  }

  // 3) Workbook auto-import on first launch.
  let imported = false;
  const positionCount = await Position.countDocuments({ tenantId: tenant._id });
  if (positionCount === 0 && fs.existsSync(SAMPLE_WORKBOOK_PATH)) {
    const buffer = fs.readFileSync(SAMPLE_WORKBOOK_PATH);
    await runImport({
      tenantId: tenant._id,
      filename: path.basename(SAMPLE_WORKBOOK_PATH),
      buffer,
      startedBy: user._id,
    });
    imported = true;
  }

  const positions = await Position.countDocuments({ tenantId: tenant._id, leftAt: null });
  const { Role } = await import('../models/Role');
  const roles = await Role.countDocuments({ tenantId: tenant._id });

  const token = signToken({
    _id: user._id,
    tenantId: tenant._id,
    roles: user.roles,
    email: user.email,
  });

  return {
    token,
    tenant: { id: String(tenant._id), slug: tenant.slug, name: tenant.name },
    user: { id: String(user._id), email: user.email, roles: user.roles },
    imported,
    positions,
    roles,
    workbookPath: fs.existsSync(SAMPLE_WORKBOOK_PATH) ? SAMPLE_WORKBOOK_PATH : null,
  };
}

/**
 * Re-import the original workbook for the current tenant - used by the
 * "Reload" button in the UI. Re-uses runImport so manager resolution
 * runs through the same code path as a fresh upload.
 */
export async function reloadDefaultWorkbook(opts: {
  tenantId: import('mongoose').Types.ObjectId;
  startedBy?: import('mongoose').Types.ObjectId | null;
}): Promise<{ imported: boolean; rowsParsed: number; positionsCreated: number; rolesDiscovered: number; errorCount: number; }> {
  if (!fs.existsSync(SAMPLE_WORKBOOK_PATH)) {
    return { imported: false, rowsParsed: 0, positionsCreated: 0, rolesDiscovered: 0, errorCount: 0 };
  }
  const buffer = fs.readFileSync(SAMPLE_WORKBOOK_PATH);
  const result = await runImport({
    tenantId: opts.tenantId,
    filename: path.basename(SAMPLE_WORKBOOK_PATH),
    buffer,
    startedBy: opts.startedBy ?? null,
  });
  return {
    imported: true,
    rowsParsed: result.rowsParsed,
    positionsCreated: result.positionsCreated,
    rolesDiscovered: result.rolesDiscovered,
    errorCount: result.errorCount,
  };
}
