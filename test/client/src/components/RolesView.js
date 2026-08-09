import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import toast from 'react-hot-toast';
import { useAutoDetectRoles, useCreateRole, useResetAllRoles, useRoles, useUpdateRole, } from '../api/hooks';
import { RolesTable } from './RolesTable';
export function RolesView() {
    const rolesQ = useRoles();
    const create = useCreateRole();
    const autoDetect = useAutoDetectRoles();
    const resetAll = useResetAllRoles();
    const update = useUpdateRole();
    return (_jsxs("section", { className: "bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-semibold text-slate-900", children: "Roles" }), _jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Levels and scopes are inferred from the data. Override anything you want; click a role's people count to manage members." })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: "btn-secondary", disabled: resetAll.isPending, onClick: () => {
                                    if (!confirm('Reset all roles? Your level/scope overrides and any role renames will be lost.'))
                                        return;
                                    resetAll.mutate(undefined, {
                                        onSuccess: () => toast.success('Roles re-detected from scratch'),
                                        onError: (e) => toast.error(e?.message || 'Reset failed'),
                                    });
                                }, children: resetAll.isPending ? 'Resetting…' : 'Reset all roles' }), _jsx("button", { type: "button", className: "btn-secondary", disabled: autoDetect.isPending, onClick: () => autoDetect.mutate(undefined, {
                                    onSuccess: () => toast.success('Re-ran detection'),
                                    onError: (e) => toast.error(e?.message || 'Detection failed'),
                                }), children: autoDetect.isPending ? 'Detecting…' : 'Re-detect from data' }), _jsx("button", { type: "button", className: "btn-primary", onClick: () => {
                                    const name = prompt('Role name (e.g. National Sales Head):');
                                    if (!name)
                                        return;
                                    create.mutate({ name, aliases: [name.toUpperCase()] }, {
                                        onSuccess: () => toast.success('Role added'),
                                        onError: (e) => toast.error(e?.message || 'Add failed'),
                                    });
                                }, children: "+ Add role" })] })] }), _jsx(RolesTable, { roles: rolesQ.data?.roles ?? [], loading: rolesQ.isLoading, onSave: (id, patch) => {
                    update.mutate({ id, ...patch }, {
                        onSuccess: () => toast.success('Saved'),
                        onError: (e) => toast.error(e?.message || 'Save failed'),
                    });
                } })] }));
}
