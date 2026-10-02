import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useEmployees, useMarkLeft } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'leave' }>;
}

export function LeaveDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const empQ = useEmployee(dialog.subjectId);
  const allQ = useEmployees({});
  const markLeft = useMarkLeft();
  const [reassignTo, setReassignTo] = useState<string>('default');

  if (!empQ.data) return null;
  const emp = empQ.data.employee;

  const candidates = (allQ.data?.items || []).filter(
    (e) => e.id !== emp.id && !e.is_vacant,
  );

  const onConfirm = () => {
    let target: string | null = null;
    if (reassignTo === 'orphan') target = null;
    else if (reassignTo === 'default') target = emp.manager_id || null;
    else target = reassignTo;
    markLeft.mutate(
      { id: emp.id, reassign_to: target },
      {
        onSuccess: () => {
          toast.success(`${emp.name} marked as left`);
          closeDialog();
        },
        onError: (e: any) => toast.error(e?.message || 'Leave failed'),
      },
    );
  };

  return (
    <Dialog
      large
      title={`Mark ${emp.name} as left`}
      subtitle={`${emp.direct_reports} direct report${emp.direct_reports === 1 ? '' : 's'} need${emp.direct_reports === 1 ? 's' : ''} a new manager.`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>Cancel</button>
          <button
            type="button"
            className="btn-primary danger"
            onClick={onConfirm}
            disabled={markLeft.isPending}
          >
            {markLeft.isPending ? 'Working…' : 'Confirm leave'}
          </button>
        </>
      }
    >
      <label className="block text-xs font-semibold text-slate-600 mb-1">Reassign reports to</label>
      <select
        className="filter-select w-full"
        value={reassignTo}
        onChange={(e) => setReassignTo(e.target.value)}
      >
        <option value="default">
          Default — bump to {emp.manager?.name || 'their manager'} (or orphan if no manager)
        </option>
        <option value="orphan">Orphan (no manager — they become roots)</option>
        <optgroup label="Pick someone specific">
          {candidates.slice(0, 200).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.role_name}{c.zone ? ` · ${c.zone}` : ''}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="text-xs text-slate-500 mt-2">
        You can restore this person later from the "{emp.name ? 'Removed people' : 'left'}"
        list (the red pill in the header).
      </p>
    </Dialog>
  );
}
