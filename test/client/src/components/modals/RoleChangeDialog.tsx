import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useRoles, useSetRole } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { scopeLabel } from '../../utils/format';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'role-change' }>;
}

export function RoleChangeDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const empQ = useEmployee(dialog.subjectId);
  const rolesQ = useRoles();
  const setRole = useSetRole();
  const [roleId, setRoleId] = useState<string>('');

  const currentRoleId = empQ.data?.employee.role_id || '';
  const effective = roleId || currentRoleId;

  const sortedRoles = useMemo(() => {
    const arr = [...(rolesQ.data?.roles || [])];
    arr.sort((a, b) => {
      if (b.effectiveLevel !== a.effectiveLevel) return b.effectiveLevel - a.effectiveLevel;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [rolesQ.data]);

  const onSave = () => {
    if (!effective || effective === currentRoleId) return;
    setRole.mutate(
      { id: dialog.subjectId, role_id: effective },
      {
        onSuccess: () => {
          toast.success('Role updated');
          closeDialog();
        },
        onError: (e: any) => toast.error(e?.message || 'Update failed'),
      },
    );
  };

  if (!empQ.data) return null;
  const emp = empQ.data.employee;

  return (
    <Dialog
      title={`Change role · ${emp.name}`}
      subtitle={`Currently ${emp.role_name} (L${emp.level} · ${scopeLabel(emp.scope)})`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!effective || effective === currentRoleId || setRole.isPending}
            onClick={onSave}
          >
            {setRole.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <select
        className="filter-select w-full"
        value={effective}
        onChange={(e) => setRoleId(e.target.value)}
      >
        {sortedRoles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · L{r.effectiveLevel} · {scopeLabel(r.effectiveScope)}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500 mt-2">
        Per-person role overrides survive a workbook re-import — the role engine
        respects this person's pinned choice.
      </p>
    </Dialog>
  );
}
