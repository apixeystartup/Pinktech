import { useMemo, useState } from 'react';
import { useEmployees } from '../../api/hooks';
import type { Employee } from '../../api/types';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { classNames, initials } from '../../utils/format';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'picker' }>;
}

export function EmployeePickerDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const [q, setQ] = useState('');
  const [restrictToRole, setRestrictToRole] = useState(true);
  const { data, isLoading } = useEmployees({
    q: q || undefined,
    role_id: restrictToRole ? dialog.preFilterRoleId || undefined : undefined,
  });
  const [pickedId, setPickedId] = useState<string | null>(null);

  const items = useMemo(() => {
    const list = data?.items || [];
    const exclude = new Set(dialog.excludeIds || []);
    return list.filter((e: Employee) => !exclude.has(e.id) && !e.is_vacant);
  }, [data, dialog.excludeIds]);

  const onConfirm = () => {
    if (!pickedId) return;
    dialog.onPick(pickedId);
    closeDialog();
  };

  const showRoleToggle = !!dialog.preFilterRoleId;

  return (
    <Dialog
      large
      title={dialog.title}
      subtitle={dialog.subtitle}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!pickedId} onClick={onConfirm}>
            Confirm
          </button>
        </>
      }
    >
      <input
        type="text"
        className="filter-select w-full"
        autoFocus
        placeholder="Search by name, EMP ID, designation…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {showRoleToggle && (
        <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={restrictToRole}
            onChange={(e) => setRestrictToRole(e.target.checked)}
          />
          Limit to people in the same role
        </label>
      )}
      <div className="picker-list mt-3">
        {isLoading && <div className="picker-row text-slate-500">Loading…</div>}
        {!isLoading && items.length === 0 && (
          <div className="picker-row text-slate-500">No matches.</div>
        )}
        {items.slice(0, 200).map((emp: Employee) => (
          <div
            key={emp.id}
            className={classNames('picker-row', pickedId === emp.id && 'selected')}
            onClick={() => setPickedId(emp.id)}
          >
            <div className="flex items-center gap-2">
              <div className="dir-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {initials(emp.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="picker-row-name truncate">{emp.name}</div>
                <div className="picker-row-meta truncate">
                  {emp.role_name || emp.designation}
                  {emp.emp_id ? ` · ${emp.emp_id}` : ''}
                  {emp.zone ? ` · ${emp.zone}` : ''}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
