import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSetEmployeeContactEmail } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'edit-employee-email' }>;
}

export function EditEmployeeEmailDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const mut = useSetEmployeeContactEmail();
  const [value, setValue] = useState(dialog.initialEmail || '');

  const onSave = () => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email or leave empty to clear official email');
      return;
    }
    mut.mutate(
      { id: dialog.subjectId, contact_email: trimmed || null },
      {
        onSuccess: () => {
          toast.success(trimmed ? 'Official email saved' : 'Official email cleared');
          closeDialog();
        },
        onError: (e: any) => toast.error(e?.message || 'Update failed'),
      },
    );
  };

  return (
    <Dialog
      title="Official email"
      subtitle="Official / work email for the org directory (from Excel on upload). Clearing removes it until the next workbook import."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={mut.isPending} onClick={onSave}>
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <label className="block text-xs font-semibold text-slate-600 mb-1">Official email</label>
      <input
        type="email"
        className="filter-select w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="name@company.com"
        autoComplete="email"
      />
    </Dialog>
  );
}
