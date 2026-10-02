import { useState } from 'react';
import toast from 'react-hot-toast';
import { useResetRole } from '../api/hooks';
import type { Role } from '../api/types';
import { useUi } from '../store/ui';
import { classNames, scopeClass, scopeLabel } from '../utils/format';
import { MembersPanel } from './MembersPanel';

const SCOPES = ['ALL_INDIA', 'ZONE', 'REGION', 'AREA', 'HQ'] as const;

interface RolesTableProps {
  roles: Role[];
  loading: boolean;
  onSave: (id: string, patch: { name?: string; override?: { level?: number | null; scope?: string | null } }) => void;
}

export function RolesTable({ roles, loading, onSave }: RolesTableProps) {
  const expandedRoles = useUi((s) => s.expandedRoles);
  const toggleRoleExpansion = useUi((s) => s.toggleRoleExpansion);
  const reset = useResetRole();

  return (
    <div className="overflow-auto">
      <table className="roles-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Aliases</th>
            <th>Level</th>
            <th>Scope</th>
            <th>People in this role</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="empty-row">Loading roles…</td>
            </tr>
          )}
          {!loading && roles.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-row">No roles yet — click "Re-detect from data".</td>
            </tr>
          )}
          {roles.map((role) => (
            <RoleRowFragment
              key={role.id}
              role={role}
              expanded={expandedRoles.has(role.id)}
              toggleExpanded={() => toggleRoleExpansion(role.id)}
              onSave={onSave}
              onReset={() =>
                reset.mutate(role.id, {
                  onSuccess: () => toast.success('Override cleared'),
                  onError: (e: any) => toast.error(e?.message || 'Reset failed'),
                })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RoleRowProps {
  role: Role;
  expanded: boolean;
  toggleExpanded: () => void;
  onSave: RolesTableProps['onSave'];
  onReset: () => void;
}

function RoleRowFragment(props: RoleRowProps) {
  const { role, expanded, toggleExpanded, onSave, onReset } = props;
  const [name, setName] = useState(role.name);
  const [overrideLevel, setOverrideLevel] = useState<string>(
    role.override?.level !== undefined ? String(role.override.level) : '',
  );
  const [overrideScope, setOverrideScope] = useState<string>(
    role.override?.scope || '',
  );

  const dirty =
    name !== role.name ||
    String(role.override?.level ?? '') !== overrideLevel ||
    String(role.override?.scope ?? '') !== overrideScope;

  const onCommit = () => {
    if (!dirty) return;
    const patch: Parameters<RolesTableProps['onSave']>[1] = {};
    if (name !== role.name) patch.name = name;
    const level = overrideLevel === '' ? null : Number(overrideLevel);
    const scope = overrideScope === '' ? null : overrideScope;
    patch.override = { level, scope };
    onSave(role.id, patch);
  };

  return (
    <>
      <tr className={classNames('role-row', expanded && 'open')}>
        <td>
          <input
            className="role-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </td>
        <td>
          <div className="alias-list">
            {role.aliases.map((a) => (
              <span key={a} className="alias-chip">{a}</span>
            ))}
          </div>
        </td>
        <td>
          <input
            type="number"
            className="override-level"
            placeholder={String(role.auto.level)}
            value={overrideLevel}
            onChange={(e) => setOverrideLevel(e.target.value)}
            onBlur={onCommit}
          />
          <span className="text-xs text-slate-500 ml-1">auto: {role.auto.level}</span>
        </td>
        <td>
          <select
            className="override-select"
            value={overrideScope}
            onChange={(e) => {
              setOverrideScope(e.target.value);
              // Trigger commit immediately for selects.
              setTimeout(onCommit, 0);
            }}
          >
            <option value="">— auto: {scopeLabel(role.auto.scope)} —</option>
            {SCOPES.map((s) => (
              <option key={s} value={s}>{scopeLabel(s)}</option>
            ))}
          </select>
          <span className={classNames(scopeClass(role.effectiveScope), 'ml-1')}>
            {scopeLabel(role.effectiveScope)}
          </span>
          {(role.override?.level !== undefined || role.override?.scope) && (
            <button type="button" className="ml-2 text-xs text-pink-700" onClick={onReset}>
              reset
            </button>
          )}
        </td>
        <td>
          <button
            type="button"
            className={classNames('role-count-btn', expanded && 'open')}
            onClick={toggleExpanded}
          >
            <span className="role-count-num">{role.employeeCount}</span>
            <span className="role-count-label">people</span>
            <span className="role-count-chev">{expanded ? '▾' : '▸'}</span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="role-members">
          <td colSpan={5}>
            <div className="role-members-body">
              <MembersPanel role={role} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
