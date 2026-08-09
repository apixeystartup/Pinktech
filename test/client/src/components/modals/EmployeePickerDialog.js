import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useEmployees } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { classNames, initials } from '../../utils/format';
export function EmployeePickerDialog({ dialog }) {
    const closeDialog = useUi((s) => s.closeDialog);
    const [q, setQ] = useState('');
    const [restrictToRole, setRestrictToRole] = useState(true);
    const { data, isLoading } = useEmployees({
        q: q || undefined,
        role_id: restrictToRole ? dialog.preFilterRoleId || undefined : undefined,
    });
    const [pickedId, setPickedId] = useState(null);
    const items = useMemo(() => {
        const list = data?.items || [];
        const exclude = new Set(dialog.excludeIds || []);
        return list.filter((e) => !exclude.has(e.id) && !e.is_vacant);
    }, [data, dialog.excludeIds]);
    const onConfirm = () => {
        if (!pickedId)
            return;
        dialog.onPick(pickedId);
        closeDialog();
    };
    const showRoleToggle = !!dialog.preFilterRoleId;
    return (_jsxs(Dialog, { large: true, title: dialog.title, subtitle: dialog.subtitle, footer: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Cancel" }), _jsx("button", { type: "button", className: "btn-primary", disabled: !pickedId, onClick: onConfirm, children: "Confirm" })] }), children: [_jsx("input", { type: "text", className: "filter-select w-full", autoFocus: true, placeholder: "Search by name, EMP ID, designation\u2026", value: q, onChange: (e) => setQ(e.target.value) }), showRoleToggle && (_jsxs("label", { className: "flex items-center gap-2 mt-2 text-xs text-slate-600", children: [_jsx("input", { type: "checkbox", checked: restrictToRole, onChange: (e) => setRestrictToRole(e.target.checked) }), "Limit to people in the same role"] })), _jsxs("div", { className: "picker-list mt-3", children: [isLoading && _jsx("div", { className: "picker-row text-slate-500", children: "Loading\u2026" }), !isLoading && items.length === 0 && (_jsx("div", { className: "picker-row text-slate-500", children: "No matches." })), items.slice(0, 200).map((emp) => (_jsx("div", { className: classNames('picker-row', pickedId === emp.id && 'selected'), onClick: () => setPickedId(emp.id), children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "dir-avatar", style: { width: 28, height: 28, fontSize: 11 }, children: initials(emp.name) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "picker-row-name truncate", children: emp.name }), _jsxs("div", { className: "picker-row-meta truncate", children: [emp.role_name || emp.designation, emp.emp_id ? ` · ${emp.emp_id}` : '', emp.zone ? ` · ${emp.zone}` : ''] })] })] }) }, emp.id)))] })] }));
}
