import toast from 'react-hot-toast';
import {
  useAncestry,
  useEmployee,
  useReassignReports,
  useRestore,
  useSetManager,
} from '../api/hooks';
import { useUi } from '../store/ui';
import type { Employee } from '../api/types';
import { classNames, fmtDate, initials, scopeClass, scopeLabel } from '../utils/format';

export function DetailPanel() {
  const selectedId = useUi((s) => s.selectedId);
  const setSelected = useUi((s) => s.setSelected);
  const openDialog = useUi((s) => s.openDialog);
  const empQ = useEmployee(selectedId);
  const ancQ = useAncestry(selectedId);
  const setManager = useSetManager();
  const restore = useRestore();
  const reassign = useReassignReports();

  if (!selectedId) {
    return (
      <div className="px-5 py-8 text-sm text-slate-500 leading-relaxed">
        Pick someone from the directory or the org tree to see their full record here.
      </div>
    );
  }

  if (empQ.isLoading || !empQ.data) {
    return <div className="px-5 py-8 text-sm text-slate-500">Loading…</div>;
  }
  const emp = empQ.data.employee;

  const onPickManager = () => {
    openDialog({
      kind: 'picker',
      title: `Choose new manager for ${emp.name}`,
      subtitle: 'The cycle detection will block self-loops automatically.',
      excludeIds: [emp.id],
      onPick: (id) => {
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

  const onPickReassignTarget = () => {
    if (emp.direct_reports === 0) {
      toast('No direct reports to reassign.');
      return;
    }
    openDialog({
      kind: 'picker',
      title: `Reassign all reports of ${emp.name}`,
      subtitle: `${emp.direct_reports} report${emp.direct_reports === 1 ? '' : 's'} will move under the chosen person.`,
      excludeIds: [emp.id],
      onPick: (id) => {
        if (!id) return;
        reassign.mutate(
          { from_id: emp.id, to_id: id },
          {
            onSuccess: () => toast.success('Reports reassigned'),
            onError: (e: any) => toast.error(e?.message || 'Reassign failed'),
          },
        );
      },
    });
  };

  return (
    <div className="min-w-0 flex flex-col flex-1">
      <div className="px-6 pt-6 pb-5 border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className={classNames('dir-avatar shrink-0', emp.is_vacant && 'vacant')}>
            {emp.is_vacant ? 'V' : initials(emp.name)}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 break-words leading-snug" title={emp.name}>
              {emp.name}
            </h2>
            <p className="text-sm text-slate-500 break-words leading-relaxed">
              {emp.role_name || emp.designation || 'Unspecified'}
              {emp.emp_id ? ` · ${emp.emp_id}` : ''}
            </p>
            <div className="dir-tags pt-1">
              <span className="tag level">L{emp.level}</span>
              <span className={scopeClass(emp.scope)}>{scopeLabel(emp.scope)}</span>
              {emp.zone && <span className="tag zone">{emp.zone}</span>}
              {emp.is_vacant && <span className="tag vacant">Vacant</span>}
              {emp.added_manually && <span className="tag reports">Added</span>}
              {emp.direct_reports > 0 && (
                <span className="tag reports">{emp.direct_reports} reports</span>
              )}
              {emp.external_manager && <span className="tag ext">External boss</span>}
            </div>
          </div>
          <button
            type="button"
            className="action-btn shrink-0 self-start"
            onClick={() => setSelected(null)}
            title="Clear selection"
          >
            ×
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        <FieldGrid
          emp={emp}
          onEditOfficialEmail={() =>
            openDialog({
              kind: 'edit-employee-email',
              subjectId: emp.id,
              initialEmail: emp.official_email || '',
            })
          }
        />
        {ancQ.data && ancQ.data.ancestry.length > 0 && (
          <div className="text-xs text-slate-500 leading-relaxed pt-5 mt-2 border-t border-slate-100">
            <span className="text-slate-400">Reporting line: </span>
            {ancQ.data.ancestry.map((a, idx) => (
              <span key={a.id}>
                {idx > 0 && <span className="mx-1 text-slate-300">›</span>}
                {a.id === emp.id ? (
                  <span className="font-semibold text-slate-700">{a.name}</span>
                ) : (
                  <button
                    type="button"
                    className="ancestry-link"
                    onClick={() => setSelected(a.id)}
                  >
                    {a.name}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-5 border-t border-slate-100 flex flex-wrap gap-3">
        <button type="button" className="action-btn" onClick={onPickManager}>
          Edit reporting line
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => openDialog({ kind: 'role-change', subjectId: emp.id })}
        >
          Change role
        </button>
        <button type="button" className="action-btn" onClick={onPickReassignTarget}>
          Reassign reports…
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() =>
            openDialog({
              kind: 'add-employee',
              defaults: {
                name: '',
                manager_id: emp.id,
                role_id: emp.role_id,
                hq: emp.hq,
                zone: emp.zone,
                region: emp.region,
                state: emp.state,
              },
            })
          }
        >
          + Add direct report
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => openDialog({ kind: 'replace', subjectId: emp.id })}
        >
          Replace
        </button>
        <button
          type="button"
          className="action-btn danger"
          onClick={() => openDialog({ kind: 'leave', subjectId: emp.id })}
          disabled={restore.isPending}
        >
          Mark as left
        </button>
      </div>
    </div>
  );
}

function FieldGrid({
  emp,
  onEditOfficialEmail,
}: {
  emp: Employee;
  onEditOfficialEmail: () => void;
}) {
  const official = emp.official_email || null;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 min-w-0">
      <Field label="EMP ID" value={emp.emp_id} />
      <div className="field col-span-2 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="label">Official email (from sheet)</div>
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={onEditOfficialEmail}
          >
            Edit
          </button>
        </div>
        <div
          className={classNames('value', !official && 'muted')}
          title={official || undefined}
        >
          {official || '—'}
        </div>
      </div>
      <Field label="Designation" value={emp.designation} />
      <Field label="Manager" value={emp.manager?.name || emp.external_manager || '—'} />
      <Field label="Role · Level · Scope" value={`${emp.role_name} · L${emp.level} · ${scopeLabel(emp.scope)}`} />
      <Field label="HQ" value={emp.hq} />
      <Field label="Zone" value={emp.zone} />
      <Field label="Region" value={emp.region} />
      <Field label="State" value={emp.state} />
      <Field label="DOJ" value={fmtDate(emp.doj)} />
      <Field label="DOB" value={fmtDate(emp.dob)} />
      <Field label="Gender" value={emp.gender} />
      <Field label="Reporting Manager (raw)" value={emp.reporting_manager_raw} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = value === null || value === undefined || value === '' || value === '—';
  const display = empty ? '—' : value;
  return (
    <div className="field min-w-0">
      <div className="label">{label}</div>
      <div className={classNames('value', empty && 'muted')} title={empty ? undefined : String(display)}>
        {display}
      </div>
    </div>
  );
}
