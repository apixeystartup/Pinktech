import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAddEmployee, useEmployees, useRoles } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { scopeLabel } from '../../utils/format';
export function AddEmployeeDialog({ dialog }) {
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
    const onSave = () => {
        if (!name.trim()) {
            toast.error('Name is required');
            return;
        }
        addEmp.mutate({
            name: name.trim(),
            emp_id: empId.trim() || undefined,
            role_id: roleId || undefined,
            manager_id: managerId || undefined,
            hq: hq || undefined,
            zone: zone || undefined,
            region: region || undefined,
            state: state || undefined,
        }, {
            onSuccess: () => {
                toast.success('Person added');
                closeDialog();
            },
            onError: (e) => toast.error(e?.message || 'Add failed'),
        });
    };
    return (_jsx(Dialog, { large: true, title: "Add a person", subtitle: "Manually-added people survive a workbook re-import via their EMP ID.", footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Cancel" }), _jsx("button", { type: "button", className: "btn-primary", disabled: addEmp.isPending, onClick: onSave, children: addEmp.isPending ? 'Adding…' : 'Add person' })] }), children: _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Full name *", value: name, onChange: setName, autoFocus: true }), _jsx(Field, { label: "EMP ID", value: empId, onChange: setEmpId, placeholder: "auto-generated if blank" }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: "Role" }), _jsxs("select", { className: "filter-select w-full", value: roleId, onChange: (e) => setRoleId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 pick a role \u2014" }), rolesQ.data?.roles.map((r) => (_jsxs("option", { value: r.id, children: [r.name, " \u00B7 L", r.effectiveLevel, " \u00B7 ", scopeLabel(r.effectiveScope)] }, r.id)))] })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: "Reports to" }), _jsxs("select", { className: "filter-select w-full", value: managerId, onChange: (e) => setManagerId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 no manager (will be a root) \u2014" }), (peopleQ.data?.items || [])
                                    .filter((p) => !p.is_vacant)
                                    .slice(0, 500)
                                    .map((p) => (_jsxs("option", { value: p.id, children: [p.name, " \u00B7 ", p.role_name, p.zone ? ` · ${p.zone}` : ''] }, p.id)))] })] }), _jsx(Field, { label: "HQ", value: hq, onChange: setHq }), _jsx(Field, { label: "Zone", value: zone, onChange: setZone }), _jsx(Field, { label: "Region", value: region, onChange: setRegion }), _jsx(Field, { label: "State", value: state, onChange: setState })] }) }));
}
function Field({ label, value, onChange, placeholder, autoFocus, }) {
    return (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: label }), _jsx("input", { type: "text", className: "filter-select w-full", value: value, placeholder: placeholder, autoFocus: autoFocus, onChange: (e) => onChange(e.target.value) })] }));
}
