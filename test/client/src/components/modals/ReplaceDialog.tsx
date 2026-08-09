import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useReplacePerson } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'replace' }>;
}

export function ReplaceDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const empQ = useEmployee(dialog.subjectId);
  const replace = useReplacePerson();
  const [name, setName] = useState('');
  const [empId, setEmpId] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  if (!empQ.data) return null;
  const emp = empQ.data.employee;

  const onConfirm = () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    const ce = contactEmail.trim().toLowerCase();
    if (ce && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) {
      toast.error('Enter a valid email or leave blank');
      return;
    }
    replace.mutate(
      {
        id: emp.id,
        payload: {
          name: name.trim(),
          emp_id: empId.trim() || undefined,
          contact_email: ce || undefined,
          // Role + manager + geography default to subject's on the server.
        },
      },
      {
        onSuccess: () => {
          toast.success(`${emp.name} replaced by ${name.trim()}`);
          closeDialog();
        },
        onError: (e: any) => toast.error(e?.message || 'Replace failed'),
      },
    );
  };

  return (
    <Dialog
      title={`Replace ${emp.name}`}
      subtitle={`The new person inherits ${emp.name}'s role, manager, and geography.
${emp.direct_reports} direct report${emp.direct_reports === 1 ? '' : 's'} will move under them, and ${emp.name} will be marked as left.`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!name.trim() || replace.isPending}
            onClick={onConfirm}
          >
            {replace.isPending ? 'Working…' : 'Replace'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">New person's name *</label>
          <input
            type="text"
            className="filter-select w-full"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">EMP ID</label>
          <input
            type="text"
            className="filter-select w-full"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            placeholder="Optional — auto-generated if blank"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Email (optional)</label>
          <input
            type="email"
            className="filter-select w-full"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Work email for the new person"
          />
        </div>
        <p className="text-xs text-slate-500">
          You can edit role / manager / geography afterwards from the detail panel.
        </p>
      </div>
    </Dialog>
  );
}
