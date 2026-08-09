/**
 * RBAC seed table. Permission keys are dot-namespaced; the permission
 * middleware accepts the key and matches it against the user's role.
 * "owner" is the bootstrap role created when a tenant is first registered.
 */
export const PERMISSIONS = {
  // Engine
  'role.view':         'Read role records',
  'role.create':       'Create new roles (Split flow)',
  'role.update':       'Edit role name / aliases / overrides',
  'role.delete':       'Delete a role',
  'role.merge':        'Merge two roles',
  'role.auto_detect':  'Re-run role inference',
  // Imports
  'import.create':     'Upload xlsx for import',
  'import.view':       'List imports + errors',
  // Positions
  'position.view':     'List positions',
  'position.update':   'Edit position parents',
  // Tenant admin
  'user.invite':       'Invite a user (placeholder)',
  'audit.view':        'View audit log',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Default role -> permissions mapping. The owner can do everything. */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  owner: Object.keys(PERMISSIONS) as PermissionKey[],
  admin: [
    'role.view', 'role.create', 'role.update', 'role.delete',
    'role.merge', 'role.auto_detect',
    'import.create', 'import.view',
    'position.view', 'position.update',
    'audit.view',
  ],
  manager: [
    'role.view',
    'import.view',
    'position.view',
  ],
  viewer: ['role.view', 'position.view'],
};

export function permissionsFor(roles: string[]): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const r of roles) {
    for (const p of ROLE_PERMISSIONS[r] || []) out.add(p);
  }
  return out;
}
