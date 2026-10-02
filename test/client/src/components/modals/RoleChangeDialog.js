import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useRoles, useSetRole } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { scopeLabel } from '../../utils/format';
export function RoleChangeDialog({ dialog }) {
    const closeDialog = useUi((s) => s.closeDialog);
    const empQ = useEmployee(dialog.subjectId);
    const rolesQ = useRoles();
    const setRole = useSetRole();
    const [roleId, setRoleId] = useState('');
    const currentRoleId = empQ.data?.employee.role_id || '';
    const effective = roleId || currentRoleId;
    const sortedRoles = useMemo(() => {
        const arr = [...(rolesQ.data?.roles || [])];
        arr.sort((a, b) => {
            if (b.effectiveLevel !== a.effectiveLevel)
                return b.effectiveLevel - a.effectiveLevel;
            return a.name.localeCompare(b.name);
        });
        return arr;
    }, [rolesQ.data]);
    const onSave = () => {
        if (!effective || effective === currentRoleId)
            return;
        setRole.mutate({ id: dialog.subjectId, role_id: effective }, {
            onSuccess: () => {
                toast.success('Role updated');
                closeDialog();
            },
            onError: (e) => toast.error(e?.message || 'Update failed'),
        });
    };
    if (!empQ.data)
        return null;
    const emp = empQ.data.employee;
    return (_jsxs(Dialog, { title: `Change role · ${emp.name}`, subtitle: `Currently ${emp.role_name} (L${emp.level} · ${scopeLabel(emp.scope)})`, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Cancel" }), _jsx("button", { type: "button", className: "btn-primary", disabled: !effective || effective === currentRoleId || setRole.isPending, onClick: onSave, children: setRole.isPending ? 'Saving…' : 'Save' })] }), children: [_jsx("select", { className: "filter-select w-full", value: effective, onChange: (e) => setRoleId(e.target.value), children: sortedRoles.map((r) => (_jsxs("option", { value: r.id, children: [r.name, " \u00B7 L", r.effectiveLevel, " \u00B7 ", scopeLabel(r.effectiveScope)] }, r.id))) }), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: "Per-person role overrides survive a workbook re-import \u2014 the role engine respects this person's pinned choice." })] }));
}
