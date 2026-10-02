import { AuditLog } from '../models/AuditLog';
import type { AuthContext } from '../middlewares/types';

/**
 * Wrap a service-level mutation so it writes an AuditLog row with
 * { tenantId, userId, action, before, after } once it succeeds.
 *
 *   const updated = await withAudit(
 *     ctx,
 *     'role.update',
 *     { kind: 'role', id: roleId },
 *     async () => {
 *       const before = await Role.findById(roleId).lean();
 *       const after = await Role.findByIdAndUpdate(roleId, patch, { new: true }).lean();
 *       return { before, after };
 *     },
 *   );
 */
export async function withAudit<T extends { before?: unknown; after?: unknown }>(
  ctx: AuthContext,
  action: string,
  entity: { kind: string; id?: string },
  fn: () => Promise<T>
): Promise<T> {
  const result = await fn();
  await AuditLog.create({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action,
    entity,
    before: result.before ?? null,
    after: result.after ?? null,
  });
  return result;
}
