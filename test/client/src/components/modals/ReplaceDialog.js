import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useReplacePerson } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
export function ReplaceDialog({ dialog }) {
    const closeDialog = useUi((s) => s.closeDialog);
    const empQ = useEmployee(dialog.subjectId);
    const replace = useReplacePerson();
    const [name, setName] = useState('');
    const [empId, setEmpId] = useState('');
    if (!empQ.data)
        return null;
    const emp = empQ.data.employee;
    const onConfirm = () => {
        if (!name.trim()) {
            toast.error('Name is required');
            return;
        }
        replace.mutate({
            id: emp.id,
            payload: {
                name: name.trim(),
                emp_id: empId.trim() || undefined,
                // Role + manager + geography default to subject's on the server.
            },
        }, {
            onSuccess: () => {
                toast.success(`${emp.name} replaced by ${name.trim()}`);
                closeDialog();
            },
            onError: (e) => toast.error(e?.message || 'Replace failed'),
        });
    };
    return (_jsx(Dialog, { title: `Replace ${emp.name}`, subtitle: `The new person inherits ${emp.name}'s role, manager, and geography.
${emp.direct_reports} direct report${emp.direct_reports === 1 ? '' : 's'} will move under them, and ${emp.name} will be marked as left.`, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Cancel" }), _jsx("button", { type: "button", className: "btn-primary", disabled: !name.trim() || replace.isPending, onClick: onConfirm, children: replace.isPending ? 'Working…' : 'Replace' })] }), children: _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: "New person's name *" }), _jsx("input", { type: "text", className: "filter-select w-full", autoFocus: true, value: name, onChange: (e) => setName(e.target.value), placeholder: "Full name" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: "EMP ID" }), _jsx("input", { type: "text", className: "filter-select w-full", value: empId, onChange: (e) => setEmpId(e.target.value), placeholder: "Optional \u2014 auto-generated if blank" })] }), _jsx("p", { className: "text-xs text-slate-500", children: "You can edit role / manager / geography afterwards from the detail panel." })] }) }));
}
