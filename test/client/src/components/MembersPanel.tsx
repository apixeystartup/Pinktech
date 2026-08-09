import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployees, useSetManager } from '../api/hooks';
import type { Employee, Role } from '../api/types';
import { useUi } from '../store/ui';
import { classNames, initials, scopeClass, scopeLabel } from '../utils/format';

interface MembersPanelProps {
  role: Role;
}

export function MembersPanel({ role }: MembersPanelProps) {
  const [q, setQ] = useState('');
  const setSelected = useUi((s) => s.setSelected);
  const setTab = useUi((s) => s.setTab);
  const openDialog = useUi((s) => s.openDialog);
  const { data, isLoading } = useEmployees({ role_id: role.id, q: q || undefined });

  const focus = (id: string) => {
    setSelected(id);
    setTab('org-explorer');
  };

  const addPerson = () => {
    openDialog({
      kind: 'add-employee',
      defaults: { name: '', role_id: role.id },
    });
  };

  return (
    <div>
      <div className="members-header">
        <div>
          <div className="members-title">{role.name}</div>
          <div className="members-subtitle">
            L{role.effectiveLevel} · {scopeLabel(role.effectiveScope)} · {role.employeeCount} people
            {role.aliases.length > 0 && ` · matches: ${role.aliases.join(', ')}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="filter-select"
            placeholder="Search in this role…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={addPerson}>
            + Add person
          </button>
        </div>
      </div>
      {isLoading && <div className="text-sm text-slate-500">Loading members…</div>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="members-empty">
          No one in this role yet. Use "Add person" to assign someone manually.
        </div>
      )}
      <div className="members-grid">
        {data?.items.map((m) => (
          <MemberCard key={m.id} emp={m} role={role} focus={focus} />
        ))}
      </div>
    </div>
  );
}

interface MemberCardProps {
  emp: Employee;
  role: Role;
  focus: (id: string) => void;
}

function MemberCard({ emp, role, focus }: MemberCardProps) {
  const openDialog = useUi((s) => s.openDialog);
  const setManager = useSetManager();

  const onReplace = () => openDialog({ kind: 'replace', subjectId: emp.id });
  const onLeave = () => openDialog({ kind: 'leave', subjectId: emp.id });
  const onMoveUnder = () => {
    openDialog({
      kind: 'picker',
      title: `Move ${emp.name} under another manager`,
      excludeIds: [emp.id],
      onPick: (id) => {
        if (!id) return;
        setManager.mutate(
          { id: emp.id, manager_id: id },
          {
            onSuccess: () => toast.success('Manager updated'),
            onError: (e: any) => toast.error(e?.message || 'Update failed'),
          },
        );
      },
    });
  };
  const onAddNew = () =>
    openDialog({
      kind: 'add-employee',
      defaults: { name: '', role_id: role.id, manager_id: emp.manager_id },
    });

  return (
    <div className={classNames('member-card', emp.is_vacant && 'vacant')}>
      <div className="member-top">
        <div className={classNames('member-avatar', emp.is_vacant && 'vacant')}>
          {emp.is_vacant ? 'V' : initials(emp.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="member-name truncate">{emp.name}</div>
          <div className="member-meta">
            {emp.designation || '—'}
            {emp.emp_id && <> · <span className="member-empid">{emp.emp_id}</span></>}
          </div>
          <div className="member-mgr truncate">
            {emp.manager?.name ? `Reports to ${emp.manager.name}` : 'No manager'}
          </div>
        </div>
        <button
          type="button"
          className="member-focus-btn"
          title="Open Org explorer tab with this person selected"
          onClick={() => focus(emp.id)}
        >
          ↗
        </button>
      </div>
      <div className="member-tags">
        {emp.zone && <span className="tag zone">{emp.zone}</span>}
        {emp.hq && <span className="tag">{emp.hq}</span>}
        {emp.is_vacant && <span className="tag vacant">Vacant</span>}
        {emp.added_manually && <span className="tag reports">Added</span>}
        {emp.direct_reports > 0 && <span className="tag reports">{emp.direct_reports} reports</span>}
        <span className={scopeClass(emp.scope)}>{scopeLabel(emp.scope)}</span>
      </div>
      <div className="member-actions">
        <button type="button" className="action-btn" onClick={onReplace}>
          Replace
        </button>
        <button type="button" className="action-btn" onClick={onMoveUnder}>
          Move under…
        </button>
        <button type="button" className="action-btn" onClick={onAddNew}>
          + Add new
        </button>
        <button type="button" className="action-btn danger" onClick={onLeave}>
          Mark as left
        </button>
      </div>
    </div>
  );
}
