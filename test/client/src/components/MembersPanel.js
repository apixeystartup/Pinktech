import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useEmployees, useSetManager } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames, initials, scopeClass, scopeLabel } from '../utils/format';
export function MembersPanel({ role }) {
    const [q, setQ] = useState('');
    const setSelected = useUi((s) => s.setSelected);
    const setTab = useUi((s) => s.setTab);
    const openDialog = useUi((s) => s.openDialog);
    const { data, isLoading } = useEmployees({ role_id: role.id, q: q || undefined });
    const focus = (id) => {
        setSelected(id);
        setTab('org-explorer');
    };
    const addPerson = () => {
        openDialog({
            kind: 'add-employee',
            defaults: { name: '', role_id: role.id },
        });
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "members-header", children: [_jsxs("div", { children: [_jsx("div", { className: "members-title", children: role.name }), _jsxs("div", { className: "members-subtitle", children: ["L", role.effectiveLevel, " \u00B7 ", scopeLabel(role.effectiveScope), " \u00B7 ", role.employeeCount, " people", role.aliases.length > 0 && ` · matches: ${role.aliases.join(', ')}`] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "text", className: "filter-select", placeholder: "Search in this role\u2026", value: q, onChange: (e) => setQ(e.target.value) }), _jsx("button", { type: "button", className: "btn-primary", onClick: addPerson, children: "+ Add person" })] })] }), isLoading && _jsx("div", { className: "text-sm text-slate-500", children: "Loading members\u2026" }), !isLoading && (data?.items.length ?? 0) === 0 && (_jsx("div", { className: "members-empty", children: "No one in this role yet. Use \"Add person\" to assign someone manually." })), _jsx("div", { className: "members-grid", children: data?.items.map((m) => (_jsx(MemberCard, { emp: m, role: role, focus: focus }, m.id))) })] }));
}
function MemberCard({ emp, role, focus }) {
    const openDialog = useUi((s) => s.openDialog);
    const setManager = useSetManager();
    const onReplace = () => openDialog({ kind: 'replace', subjectId: emp.id });
    const onLeave = () => openDialog({ kind: 'leave', subjectId: emp.id });
    const onMoveUnder = () => {
        openDialog({
            kind: 'picker',
            title: `Move ${emp.name} under another manager`,
            excludeIds: [emp.id],
            onPick: (id) => {
                if (!id)
                    return;
                setManager.mutate({ id: emp.id, manager_id: id }, {
                    onSuccess: () => toast.success('Manager updated'),
                    onError: (e) => toast.error(e?.message || 'Update failed'),
                });
            },
        });
    };
    const onAddNew = () => openDialog({
        kind: 'add-employee',
        defaults: { name: '', role_id: role.id, manager_id: emp.manager_id },
    });
    return (_jsxs("div", { className: classNames('member-card', emp.is_vacant && 'vacant'), children: [_jsxs("div", { className: "member-top", children: [_jsx("div", { className: classNames('member-avatar', emp.is_vacant && 'vacant'), children: emp.is_vacant ? 'V' : initials(emp.name) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "member-name truncate", children: emp.name }), _jsxs("div", { className: "member-meta", children: [emp.designation || '—', emp.emp_id && _jsxs(_Fragment, { children: [" \u00B7 ", _jsx("span", { className: "member-empid", children: emp.emp_id })] })] }), _jsx("div", { className: "member-mgr truncate", children: emp.manager?.name ? `Reports to ${emp.manager.name}` : 'No manager' })] }), _jsx("button", { type: "button", className: "member-focus-btn", title: "Focus in Explorer", onClick: () => focus(emp.id), children: "\u2197" })] }), _jsxs("div", { className: "member-tags", children: [emp.zone && _jsx("span", { className: "tag zone", children: emp.zone }), emp.hq && _jsx("span", { className: "tag", children: emp.hq }), emp.is_vacant && _jsx("span", { className: "tag vacant", children: "Vacant" }), emp.added_manually && _jsx("span", { className: "tag reports", children: "Added" }), emp.direct_reports > 0 && _jsxs("span", { className: "tag reports", children: [emp.direct_reports, " reports"] }), _jsx("span", { className: scopeClass(emp.scope), children: scopeLabel(emp.scope) })] }), _jsxs("div", { className: "member-actions", children: [_jsx("button", { type: "button", className: "action-btn", onClick: onReplace, children: "Replace" }), _jsx("button", { type: "button", className: "action-btn", onClick: onMoveUnder, children: "Move under\u2026" }), _jsx("button", { type: "button", className: "action-btn", onClick: onAddNew, children: "+ Add new" }), _jsx("button", { type: "button", className: "action-btn danger", onClick: onLeave, children: "Mark as left" })] })] }));
}
