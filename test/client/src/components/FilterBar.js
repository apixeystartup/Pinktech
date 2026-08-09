import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useFilters } from '../api/hooks';
import { useUi } from '../store/ui';
const FIELDS = [
    { key: 'zone', label: 'Zone', facet: 'zones' },
    { key: 'region', label: 'Region', facet: 'regions' },
    { key: 'state', label: 'State', facet: 'states' },
    { key: 'hq', label: 'HQ', facet: 'hqs' },
];
export function FilterBar() {
    const filters = useUi((s) => s.filters);
    const patchFilters = useUi((s) => s.patchFilters);
    const clearFilters = useUi((s) => s.clearFilters);
    const { data } = useFilters(filters);
    return (_jsxs("div", { className: "px-4 py-3 border-b border-slate-100 space-y-2", children: [_jsx("input", { type: "text", className: "filter-select w-full", placeholder: "Search by name, EMP ID, email, designation\u2026", value: filters.q || '', onChange: (e) => patchFilters({ q: e.target.value }) }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: FIELDS.map((f) => {
                    const opts = data?.[f.facet];
                    return (_jsxs("select", { className: "filter-select", value: filters[f.key] || '', onChange: (e) => patchFilters({ [f.key]: e.target.value || undefined }), children: [_jsxs("option", { value: "", children: ["All ", f.label, "s"] }), opts?.map((o) => (_jsxs("option", { value: o.value, children: [o.value, " (", o.count, ")"] }, o.value)))] }, f.key));
                }) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("select", { className: "filter-select", value: filters.role_id || '', onChange: (e) => patchFilters({ role_id: e.target.value || undefined }), children: [_jsx("option", { value: "", children: "All Roles" }), data?.roles.map((r) => (_jsxs("option", { value: r.value, children: [r.label, " \u00B7 L", r.level, " (", r.count, ")"] }, r.value)))] }), _jsxs("select", { className: "filter-select", value: filters.level !== undefined ? String(filters.level) : '', onChange: (e) => patchFilters({ level: e.target.value ? Number(e.target.value) : undefined }), children: [_jsx("option", { value: "", children: "All Levels" }), data?.levels.map((l) => (_jsxs("option", { value: l.value, children: ["Level ", l.value, " (", l.count, ")"] }, l.value)))] })] }), _jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsxs("label", { className: "flex items-center gap-1 text-slate-600", children: [_jsx("input", { type: "checkbox", checked: !!filters.vacant_only, onChange: (e) => patchFilters({ vacant_only: e.target.checked, filled_only: false }) }), "Vacant only"] }), _jsxs("label", { className: "flex items-center gap-1 text-slate-600", children: [_jsx("input", { type: "checkbox", checked: !!filters.filled_only, onChange: (e) => patchFilters({ filled_only: e.target.checked, vacant_only: false }) }), "Filled only"] }), _jsx("button", { type: "button", className: "text-pink-700 font-medium", onClick: clearFilters, children: "Clear all" })] })] }));
}
