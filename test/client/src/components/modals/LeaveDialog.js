import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployee, useEmployees, useMarkLeft } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
export function LeaveDialog({ dialog }) {
    const closeDialog = useUi((s) => s.closeDialog);
    const empQ = useEmployee(dialog.subjectId);
    const allQ = useEmployees({});
    const markLeft = useMarkLeft();
    const [reassignTo, setReassignTo] = useState('default');
    if (!empQ.data)
        return null;
    const emp = empQ.data.employee;
    const candidates = (allQ.data?.items || []).filter((e) => e.id !== emp.id && !e.is_vacant);
    const onConfirm = () => {
        let target = null;
        if (reassignTo === 'orphan')
            target = null;
        else if (reassignTo === 'default')
            target = emp.manager_id || null;
        else
            target = reassignTo;
        markLeft.mutate({ id: emp.id, reassign_to: target }, {
            onSuccess: () => {
                toast.success(`${emp.name} marked as left`);
                closeDialog();
            },
            onError: (e) => toast.error(e?.message || 'Leave failed'),
        });
    };
    return (_jsxs(Dialog, { large: true, title: `Mark ${emp.name} as left`, subtitle: `${emp.direct_reports} direct report${emp.direct_reports === 1 ? '' : 's'} need${emp.direct_reports === 1 ? 's' : ''} a new manager.`, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Cancel" }), _jsx("button", { type: "button", className: "btn-primary danger", onClick: onConfirm, disabled: markLeft.isPending, children: markLeft.isPending ? 'Working…' : 'Confirm leave' })] }), children: [_jsx("label", { className: "block text-xs font-semibold text-slate-600 mb-1", children: "Reassign reports to" }), _jsxs("select", { className: "filter-select w-full", value: reassignTo, onChange: (e) => setReassignTo(e.target.value), children: [_jsxs("option", { value: "default", children: ["Default \u2014 bump to ", emp.manager?.name || 'their manager', " (or orphan if no manager)"] }), _jsx("option", { value: "orphan", children: "Orphan (no manager \u2014 they become roots)" }), _jsx("optgroup", { label: "Pick someone specific", children: candidates.slice(0, 200).map((c) => (_jsxs("option", { value: c.id, children: [c.name, " \u00B7 ", c.role_name, c.zone ? ` · ${c.zone}` : ''] }, c.id))) })] }), _jsxs("p", { className: "text-xs text-slate-500 mt-2", children: ["You can restore this person later from the \"", emp.name ? 'Removed people' : 'left', "\" list (the red pill in the header)."] })] }));
}
