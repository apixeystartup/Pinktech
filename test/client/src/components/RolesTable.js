import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useResetRole } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames, scopeClass, scopeLabel } from '../utils/format';
import { MembersPanel } from './MembersPanel';
const SCOPES = ['ALL_INDIA', 'ZONE', 'REGION', 'AREA', 'HQ'];
export function RolesTable({ roles, loading, onSave }) {
    const expandedRoles = useUi((s) => s.expandedRoles);
    const toggleRoleExpansion = useUi((s) => s.toggleRoleExpansion);
    const reset = useResetRole();
    return (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "roles-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Role" }), _jsx("th", { children: "Aliases" }), _jsx("th", { children: "Level" }), _jsx("th", { children: "Scope" }), _jsx("th", { children: "People in this role" })] }) }), _jsxs("tbody", { children: [loading && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "empty-row", children: "Loading roles\u2026" }) })), !loading && roles.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "empty-row", children: "No roles yet \u2014 click \"Re-detect from data\"." }) })), roles.map((role) => (_jsx(RoleRowFragment, { role: role, expanded: expandedRoles.has(role.id), toggleExpanded: () => toggleRoleExpansion(role.id), onSave: onSave, onReset: () => reset.mutate(role.id, {
                                onSuccess: () => toast.success('Override cleared'),
                                onError: (e) => toast.error(e?.message || 'Reset failed'),
                            }) }, role.id)))] })] }) }));
}
function RoleRowFragment(props) {
    const { role, expanded, toggleExpanded, onSave, onReset } = props;
    const [name, setName] = useState(role.name);
    const [overrideLevel, setOverrideLevel] = useState(role.override?.level !== undefined ? String(role.override.level) : '');
    const [overrideScope, setOverrideScope] = useState(role.override?.scope || '');
    const dirty = name !== role.name ||
        String(role.override?.level ?? '') !== overrideLevel ||
        String(role.override?.scope ?? '') !== overrideScope;
    const onCommit = () => {
        if (!dirty)
            return;
        const patch = {};
        if (name !== role.name)
            patch.name = name;
        const level = overrideLevel === '' ? null : Number(overrideLevel);
        const scope = overrideScope === '' ? null : overrideScope;
        patch.override = { level, scope };
        onSave(role.id, patch);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { className: classNames('role-row', expanded && 'open'), children: [_jsx("td", { children: _jsx("input", { className: "role-name-input", value: name, onChange: (e) => setName(e.target.value), onBlur: onCommit, onKeyDown: (e) => {
                                if (e.key === 'Enter')
                                    e.target.blur();
                            } }) }), _jsx("td", { children: _jsx("div", { className: "alias-list", children: role.aliases.map((a) => (_jsx("span", { className: "alias-chip", children: a }, a))) }) }), _jsxs("td", { children: [_jsx("input", { type: "number", className: "override-level", placeholder: String(role.auto.level), value: overrideLevel, onChange: (e) => setOverrideLevel(e.target.value), onBlur: onCommit }), _jsxs("span", { className: "text-xs text-slate-500 ml-1", children: ["auto: ", role.auto.level] })] }), _jsxs("td", { children: [_jsxs("select", { className: "override-select", value: overrideScope, onChange: (e) => {
                                    setOverrideScope(e.target.value);
                                    // Trigger commit immediately for selects.
                                    setTimeout(onCommit, 0);
                                }, children: [_jsxs("option", { value: "", children: ["\u2014 auto: ", scopeLabel(role.auto.scope), " \u2014"] }), SCOPES.map((s) => (_jsx("option", { value: s, children: scopeLabel(s) }, s)))] }), _jsx("span", { className: classNames(scopeClass(role.effectiveScope), 'ml-1'), children: scopeLabel(role.effectiveScope) }), (role.override?.level !== undefined || role.override?.scope) && (_jsx("button", { type: "button", className: "ml-2 text-xs text-pink-700", onClick: onReset, children: "reset" }))] }), _jsx("td", { children: _jsxs("button", { type: "button", className: classNames('role-count-btn', expanded && 'open'), onClick: toggleExpanded, children: [_jsx("span", { className: "role-count-num", children: role.employeeCount }), _jsx("span", { className: "role-count-label", children: "people" }), _jsx("span", { className: "role-count-chev", children: expanded ? '▾' : '▸' })] }) })] }), expanded && (_jsx("tr", { className: "role-members", children: _jsx("td", { colSpan: 5, children: _jsx("div", { className: "role-members-body", children: _jsx(MembersPanel, { role: role }) }) }) }))] }));
}
