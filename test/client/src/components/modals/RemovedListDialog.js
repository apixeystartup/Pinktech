import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import toast from 'react-hot-toast';
import { useRemoved, useRestore } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { initials } from '../../utils/format';
export function RemovedListDialog() {
    const closeDialog = useUi((s) => s.closeDialog);
    const { data, isLoading } = useRemoved();
    const restore = useRestore();
    return (_jsxs(Dialog, { large: true, title: "People marked as left", subtitle: "Restore brings them back with their last manager and role intact.", footer: _jsx(_Fragment, { children: _jsx("button", { type: "button", className: "btn-secondary", onClick: closeDialog, children: "Done" }) }), children: [isLoading && _jsx("div", { className: "text-sm text-slate-500", children: "Loading\u2026" }), !isLoading && (data?.items.length ?? 0) === 0 && (_jsx("div", { className: "text-sm text-slate-500", children: "Nobody is currently marked as left." })), _jsx("div", { className: "removed-list", children: data?.items.map((p) => (_jsxs("div", { className: "removed-row", children: [_jsx("div", { className: "removed-avatar", children: initials(p.name) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "removed-name truncate", children: p.name }), _jsxs("div", { className: "removed-meta truncate", children: [p.role_name || p.designation || 'Unspecified', p.emp_id ? ` · ${p.emp_id}` : '', p.zone ? ` · ${p.zone}` : ''] }), p.last_manager_name && (_jsxs("div", { className: "removed-mgr truncate", children: ["Last reported to ", p.last_manager_name] })), _jsx("div", { className: "removed-tags", children: p.direct_reports > 0 && (_jsxs("span", { className: "tag reports", children: [p.direct_reports, " reports were waiting"] })) })] }), _jsx("button", { type: "button", className: "btn-primary removed-restore-btn", disabled: restore.isPending, onClick: () => restore.mutate({ id: p.id }, {
                                onSuccess: () => toast.success(`${p.name} restored`),
                                onError: (e) => toast.error(e?.message || 'Restore failed'),
                            }), children: "Restore" })] }, p.id))) })] }));
}
