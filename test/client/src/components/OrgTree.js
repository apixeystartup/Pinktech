import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useSubtree, useRoots } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames, initials, scopeClass, scopeLabel } from '../utils/format';
export function OrgTree() {
    const selectedId = useUi((s) => s.selectedId);
    const setSelected = useUi((s) => s.setSelected);
    const subQ = useSubtree(selectedId);
    const rootsQ = useRoots();
    if (!selectedId) {
        return (_jsxs("div", { className: "text-sm text-slate-500", children: [_jsx("p", { className: "mb-2", children: "Tip: click anyone in the directory to focus their team." }), rootsQ.data && rootsQ.data.roots.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-2", children: "Top of org:" }), _jsx("ul", { className: "space-y-1", children: rootsQ.data.roots.map((r) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "ancestry-link", onClick: () => setSelected(r.id), children: [r.name, " \u2014 ", r.role_name] }) }, r.id))) })] }))] }));
    }
    if (subQ.isLoading)
        return _jsx("div", { className: "text-sm text-slate-500", children: "Loading tree\u2026" });
    if (!subQ.data)
        return null;
    return (_jsx("ul", { className: "org-tree", children: _jsx(TreeLi, { node: subQ.data.root }) }));
}
function TreeLi({ node }) {
    const [collapsed, setCollapsed] = useState(false);
    const setSelected = useUi((s) => s.setSelected);
    const selectedId = useUi((s) => s.selectedId);
    const hasChildren = node.children && node.children.length > 0;
    return (_jsxs("li", { className: classNames(collapsed && 'collapsed'), children: [_jsxs("div", { className: classNames('node', node.is_vacant && 'vacant', node.id === selectedId && 'selected'), children: [_jsx("div", { className: classNames('node-toggle', !hasChildren && 'empty'), onClick: () => hasChildren && setCollapsed((c) => !c), title: hasChildren ? (collapsed ? 'Expand' : 'Collapse') : '' }), _jsx("div", { className: "node-body", onClick: () => setSelected(node.id), children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: classNames('dir-avatar', node.is_vacant && 'vacant'), style: { width: 32, height: 32, fontSize: 11 }, children: node.is_vacant ? 'V' : initials(node.name) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "node-name truncate", children: node.name }), _jsxs("div", { className: "node-meta truncate", children: [node.role_name || node.designation || 'Unspecified', node.emp_id ? ` · ${node.emp_id}` : ''] }), _jsxs("div", { className: "node-tags", children: [_jsxs("span", { className: "tag level", children: ["L", node.level] }), _jsx("span", { className: scopeClass(node.scope), children: scopeLabel(node.scope) }), node.zone && _jsx("span", { className: "tag zone", children: node.zone }), node.is_vacant && _jsx("span", { className: "tag vacant", children: "Vacant" }), node.added_manually && _jsx("span", { className: "tag reports", children: "Added" }), node.children.length > 0 && (_jsxs("span", { className: "tag reports", children: [node.children.length, " reports \u00B7 ", node.total_descendants, " total"] })), node.external_manager && _jsx("span", { className: "tag ext", children: "External boss" })] })] })] }) })] }), hasChildren && (_jsx("ul", { children: node.children.map((c) => (_jsx(TreeLi, { node: c }, c.id))) }))] }));
}
