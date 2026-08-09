import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useReload, useStats, useRemoved, useUploadWorkbook } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames } from '../utils/format';
export function TopBar() {
    const { data: stats } = useStats();
    const { data: removed } = useRemoved();
    const { tab, setTab, openDialog } = useUi();
    const reload = useReload();
    const upload = useUploadWorkbook();
    const fileInputRef = useRef(null);
    const onUpload = (file) => {
        upload.mutate(file, {
            onSuccess: () => toast.success(`Imported ${file.name}`),
            onError: (e) => toast.error(`Upload failed: ${e?.message || e}`),
        });
    };
    const onReload = () => {
        reload.mutate(undefined, {
            onSuccess: () => toast.success('Workbook reloaded'),
            onError: (e) => toast.error(`Reload failed: ${e?.message || e}`),
        });
    };
    const removedCount = removed?.count ?? 0;
    return (_jsxs("header", { className: "border-b border-pink-100 bg-white px-6 py-3 flex items-center justify-between gap-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-pink-700 grid place-items-center text-white font-bold text-lg", children: "N" }), _jsxs("div", { children: [_jsx("h1", { className: "text-base font-semibold text-slate-900", children: "NUTRIMAX Org Explorer" }), _jsx("p", { className: "text-xs text-slate-500", children: stats
                                    ? `${stats.total} people · ${stats.roles} roles · ${stats.max_level} levels`
                                    : 'loading…' })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "stat-pill stat-filled", children: [stats?.filled ?? '—', " filled"] }), _jsxs("span", { className: "stat-pill stat-vacant", children: [stats?.vacant ?? '—', " vacant"] }), _jsxs("span", { className: "stat-pill stat-roles", children: [stats?.roles ?? '—', " roles"] }), _jsxs("span", { className: "stat-pill stat-levels", children: ["L", stats?.max_level ?? '—'] }), removedCount > 0 && (_jsxs("button", { type: "button", className: "stat-pill stat-removed", onClick: () => openDialog({ kind: 'removed-list' }), title: "People marked as left - click to restore", children: [removedCount, " removed"] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-1 p-1 rounded-lg bg-slate-100", children: [_jsx("button", { type: "button", className: classNames('tab-btn', tab === 'explorer' && 'active'), onClick: () => setTab('explorer'), children: "Org Explorer" }), _jsx("button", { type: "button", className: classNames('tab-btn', tab === 'roles' && 'active'), onClick: () => setTab('roles'), children: "Roles" })] }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".xlsx", className: "hidden", onChange: (e) => {
                            const f = e.target.files?.[0];
                            if (f)
                                onUpload(f);
                            e.target.value = '';
                        } }), _jsx("button", { type: "button", className: "btn-secondary", onClick: () => fileInputRef.current?.click(), disabled: upload.isPending, children: upload.isPending ? 'Uploading…' : 'Upload xlsx' }), _jsx("button", { type: "button", className: "btn-primary", onClick: onReload, disabled: reload.isPending, children: reload.isPending ? 'Reloading…' : 'Reload' })] })] }));
}
