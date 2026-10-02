import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAddEmployee, useEmployees, useRoles } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { scopeLabel } from '../../utils/format';

interface Props {
  dialog: Extract<ReturnType<typeof useUi.getState>['dialog'], { kind: 'add-employee' }>;
}

export function AddEmployeeDialog({ dialog }: Props) {
  const closeDialog = useUi((s) => s.closeDialog);
  const rolesQ = useRoles();
  const peopleQ = useEmployees({});
  const addEmp = useAddEmployee();

  const d = dialog.defaults;
  const [name, setName] = useState(d.name || '');
  const [empId, setEmpId] = useState(d.emp_id || '');
  const [roleId, setRoleId] = useState(d.role_id || '');
  const [managerId, setManagerId] = useState(d.manager_id || '');
  const [hq, setHq] = useState(d.hq || '');
  const [zone, setZone] = useState(d.zone || '');
  const [region, setRegion] = useState(d.region || '');
  const [state, setState] = useState(d.state || '');
  const [contactEmail, setContactEmail] = useState(d.contact_email || '');

  const onSave = () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    const ce = contactEmail.trim().toLowerCase();
    if (ce && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) {
      toast.error('Enter a valid email or leave blank');
      return;
    }
    addEmp.mutate(
      {
        name: name.trim(),
        emp_id: empId.trim() || undefined,
        contact_email: ce || undefined,
        role_id: roleId || undefined,
        manager_id: managerId || undefined,
        hq: hq || undefined,
        zone: zone || undefined,
        region: region || undefined,
        state: state || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Person added');
          closeDialog();
        },
        onError: (e: any) => toast.error(e?.message || 'Add failed'),
      },
    );
  };

  return (
    <Dialog
      large
      title="Add a person"
      subtitle="Manually-added people survive a workbook re-import via their EMP ID."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>Cancel</button>
          <button type="button" className="btn-primary" disabled={addEmp.isPending} onClick={onSave}>
            {addEmp.isPending ? 'Adding…' : 'Add person'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name *" value={name} onChange={setName} autoFocus />
        <Field label="EMP ID" value={empId} onChange={setEmpId} placeholder="auto-generated if blank" />
        <div className="col-span-2">
          <Field
            label="Email (optional)"
            value={contactEmail}
            onChange={setContactEmail}
            placeholder="Work email — shown in org details & used for login when set"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
          <select className="filter-select w-full" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">— pick a role —</option>
            {rolesQ.data?.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · L{r.effectiveLevel} · {scopeLabel(r.effectiveScope)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reports to</label>
          <select
            className="filter-select w-full"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">— no manager (will be a root) —</option>
            {(peopleQ.data?.items || [])
              .filter((p) => !p.is_vacant)
              .slice(0, 500)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role_name}{p.zone ? ` · ${p.zone}` : ''}
                </option>
              ))}
          </select>
        </div>
        <Field label="HQ" value={hq} onChange={setHq} />
        <Field label="Zone" value={zone} onChange={setZone} />
        <Field label="Region" value={region} onChange={setRegion} />
        <Field label="State" value={state} onChange={setState} />
      </div>
    </Dialog>
  );
}

function Field({
  label, value, onChange, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type="text"
        className="filter-select w-full"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
