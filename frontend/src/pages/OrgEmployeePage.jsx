import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import toast from "react-hot-toast";
import ModulePage from "../components/common/ModulePage";
import TenantScopeBanner from "../components/common/TenantScopeBanner";
import useAuth from "../hooks/useAuth";
import api from "../lib/api";

// ─── Helpers ───────────────────────────────────────────────

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}
function scopeLabel(s) { return (s || "").replace(/_/g, " "); }
function scopeClass(s) {
  switch (s) {
    case "ALL_INDIA": return "tag scope-all-india";
    case "ZONE":      return "tag scope-zone";
    case "REGION":    return "tag scope-region";
    case "AREA":      return "tag scope-area";
    default:          return "tag scope-hq";
  }
}

// ─── Zustand store (replaces broken useOrgUi) ──────────────

const SCOPES = ["ALL_INDIA", "ZONE", "REGION", "AREA", "HQ"];

const useOrgStore = create((set) => ({
  tab: "org-tree",
  setTab: (tab) => set({ tab }),
  selectedId: null,
  setSelectedId: (selectedId) => set({ selectedId }),
  filters: {},
  patchFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  clearFilters: () => set({ filters: {} }),
  dialog: { kind: "none" },
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: { kind: "none" } }),
  expandedRoles: new Set(),
  toggleRoleExpansion: (id) => set((s) => {
    const next = new Set(s.expandedRoles);
    next.has(id) ? next.delete(id) : next.add(id);
    return { expandedRoles: next };
  }),
}));

// ─── Query keys & refresh helper ───────────────────────────

const QK = ["org-stats", "org-employees", "org-employee", "org-subtree",
  "org-ancestry", "org-roots", "org-filters", "org-roles", "org-removed"];

function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => { QK.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }, [qc]);
}

// ─── API hooks ─────────────────────────────────────────────

function useOrgStats() {
  return useQuery({ queryKey: ["org-stats"], queryFn: async () => (await api.get("/org/stats")).data, staleTime: 5000 });
}
function useOrgFilters(criteria) {
  return useQuery({ queryKey: ["org-filters", criteria], queryFn: async () => (await api.get("/org/filters", { params: criteria })).data, staleTime: 5000 });
}
function useOrgEmployees(criteria) {
  return useQuery({ queryKey: ["org-employees", criteria], queryFn: async () => (await api.get("/org/employees", { params: { ...criteria, limit: criteria.limit || 1000 } })).data, staleTime: 5000 });
}
function useOrgEmployee(key) {
  return useQuery({ queryKey: ["org-employee", key], queryFn: async () => (await api.get(`/org/employees/${key}`)).data, enabled: !!key, staleTime: 5000 });
}
function useOrgSubtree(key) {
  return useQuery({ queryKey: ["org-subtree", key], queryFn: async () => (await api.get(`/org/employees/${key}/subtree`)).data, enabled: !!key, staleTime: 5000 });
}
function useOrgAncestry(key) {
  return useQuery({ queryKey: ["org-ancestry", key], queryFn: async () => (await api.get(`/org/employees/${key}/ancestry`)).data, enabled: !!key, staleTime: 5000 });
}
function useOrgRoots() {
  return useQuery({ queryKey: ["org-roots"], queryFn: async () => (await api.get("/org/roots")).data, staleTime: 5000 });
}
function useOrgRoles() {
  return useQuery({ queryKey: ["org-roles"], queryFn: async () => (await api.get("/org/roles")).data, staleTime: 5000 });
}
function useOrgRemoved() {
  return useQuery({ queryKey: ["org-removed"], queryFn: async () => (await api.get("/org/hierarchy/removed")).data, staleTime: 1000 });
}

function useSetManager() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, manager_id }) => api.put(`/org/employees/${id}`, { manager_id }),
    onSuccess: () => { refresh(); toast.success("Manager updated"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Update failed"),
  });
}
function useSetRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, role_id }) => api.put(`/org/employees/${id}`, { role_id }),
    onSuccess: () => { refresh(); toast.success("Role updated"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Update failed"),
  });
}
function useSetContactEmail() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, contact_email }) => api.put(`/org/employees/${id}`, { contact_email }),
    onSuccess: () => { refresh(); },
    onError: (e) => toast.error(e?.response?.data?.message || "Update failed"),
  });
}
function useReassignReports() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ from_id, to_id, report_ids }) => api.post(`/org/employees/${from_id}/reassign-reports`, { to_id, report_ids }),
    onSuccess: () => { refresh(); toast.success("Reports reassigned"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Reassign failed"),
  });
}
function useMarkLeft() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, reassign_to }) => api.post(`/org/employees/${id}/leave`, { reassign_to }),
    onSuccess: () => { refresh(); toast.success("Marked as left"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Leave failed"),
  });
}
function useRestore() {
  return useMutation({
    mutationFn: ({ id }) => api.post(`/org/employees/${id}/restore`),
    onError: (e) => toast.error(e?.response?.data?.message || "Restore failed"),
  });
}
function useAddEmployee() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (payload) => api.post("/org/employees", payload),
    onSuccess: () => { refresh(); toast.success("Person added"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Add failed"),
  });
}
function useReplacePerson() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, payload }) => api.post(`/org/employees/${id}/replace`, payload),
    onSuccess: () => { refresh(); },
    onError: (e) => toast.error(e?.response?.data?.message || "Replace failed"),
  });
}
function useUpdateRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/org/roles/${id}`, body),
    onSuccess: () => { refresh(); toast.success("Role saved"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Save failed"),
  });
}
function useResetRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id) => api.post(`/org/roles/${id}/reset`),
    onSuccess: () => { refresh(); toast.success("Override cleared"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Reset failed"),
  });
}
function useCreateRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars) => api.post("/org/roles", vars),
    onSuccess: () => { refresh(); toast.success("Role added"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Add failed"),
  });
}
function useResetAllRoles() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api.post("/org/roles/reset-all"),
    onSuccess: () => { refresh(); toast.success("Roles reset"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Reset failed"),
  });
}
function useAutoDetectRoles() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api.post("/org/roles/auto-detect"),
    onSuccess: () => { refresh(); toast.success("Roles re-detected"); },
    onError: (e) => toast.error(e?.response?.data?.message || "Detection failed"),
  });
}

// ─── Page entry ────────────────────────────────────────────

export default function OrgEmployeePage() {
  const { permissionCodes = [] } = useAuth();
  const hasAccess = permissionCodes.includes("*") || permissionCodes.includes("employee.view");
  if (!hasAccess) {
    return (
      <ModulePage title="ORG employee" description="You don't have access to this section.">
        <TenantScopeBanner context="ORG employee" />
        <p style={{ padding: 16, color: "#666" }}>You don't have the required permissions to view this page.</p>
      </ModulePage>
    );
  }
  return (
    <ModulePage title="ORG employee" description="Org directory, assignments, and role management.">
      <TenantScopeBanner context="ORG employee" />
      <div className="org-page"><OrgExplorerPage /></div>
    </ModulePage>
  );
}

// ─── Main page ─────────────────────────────────────────────

function OrgExplorerPage() {
  const tab = useOrgStore((s) => s.tab);
  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 160px)" }}>
      <OrgTopBar />
      <main className="px-6 py-6 max-w-[1920px] mx-auto w-full">
        {tab === "org-tree" ? <ExplorerView variant="tree" /> : tab === "org-explorer" ? <ExplorerView variant="explorer" /> : <RolesView />}
      </main>
      <ModalRoot />
    </div>
  );
}

// ─── TopBar ────────────────────────────────────────────────

function OrgTopBar() {
  const { data: stats } = useOrgStats();
  const { data: removed } = useOrgRemoved();
  const tab = useOrgStore((s) => s.tab);
  const setTab = useOrgStore((s) => s.setTab);
  const openDialog = useOrgStore((s) => s.openDialog);
  const refresh = useRefreshAll();
  const fileInputRef = useRef(null);

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("/org/imports", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (_, file) => { toast.success(`Imported ${file.name}`); refresh(); },
    onError: (e) => toast.error(`Upload failed: ${e?.response?.data?.message || e}`),
  });
  const reloadMut = useMutation({
    mutationFn: () => api.post("/org/reload"),
    onSuccess: () => { toast.success("Workbook reloaded"); refresh(); },
    onError: (e) => toast.error(`Reload failed: ${e?.response?.data?.message || e}`),
  });

  const removedCount = removed?.count ?? 0;

  return (
    <header className="border-b border-pink-100 bg-white px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-pink-700 grid place-items-center text-white font-bold text-lg shrink-0">P</div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">Org Explorer</h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {stats ? `${stats.total} people · ${stats.roles} roles · ${stats.max_level} levels` : "loading…"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="stat-pill stat-filled">{stats?.filled ?? "—"} filled</span>
        <span className="stat-pill stat-vacant">{stats?.vacant ?? "—"} vacant</span>
        <span className="stat-pill stat-roles">{stats?.roles ?? "—"} roles</span>
        <span className="stat-pill stat-levels">L{stats?.max_level ?? "—"}</span>
        {removedCount > 0 && (
          <button type="button" className="stat-pill stat-removed" onClick={() => openDialog({ kind: "removed-list" })} title="People marked as left — click to restore">
            {removedCount} removed
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 flex-wrap">
          {[["org-tree", "Org tree"], ["org-explorer", "Org explorer"], ["roles", "Roles"]].map(([k, label]) => (
            <button key={k} type="button" className={`tab-btn${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
        <button type="button" className="org-btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? "Uploading…" : "Upload xlsx"}
        </button>
        <button type="button" className="org-btn-primary" onClick={() => reloadMut.mutate()} disabled={reloadMut.isPending}>
          {reloadMut.isPending ? "Reloading…" : "Reload"}
        </button>
      </div>
    </header>
  );
}

// ─── ExplorerView ──────────────────────────────────────────

function ExplorerView({ variant }) {
  const selectedId = useOrgStore((s) => s.selectedId);
  const gridCols = variant === "tree"
    ? "minmax(260px, 340px) minmax(0, 1fr)"
    : "minmax(260px, 340px) minmax(280px, min(520px, 52vw))";

  return (
    <div className="grid gap-4 items-stretch w-full min-w-0" style={{ gridTemplateColumns: gridCols }}>
      <DirectoryColumn />
      {variant === "tree" ? (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{selectedId ? "Org tree" : "Pick someone to see their team"}</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-prose">Click someone in the list or expand nodes in the tree to explore reporting lines. Use the Org explorer tab for profile and actions.</p>
          </div>
          <div className="p-5 min-h-0 flex-1"><OrgTreePanel /></div>
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0 org-explorer-detail">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Profile</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Select someone to view their record, role, and actions.</p>
          </div>
          <div className="min-h-0 flex-1 flex flex-col"><DetailPanel /></div>
        </section>
      )}
    </div>
  );
}

// ─── DirectoryColumn ───────────────────────────────────────

function DirectoryColumn() {
  const filters = useOrgStore((s) => s.filters);
  const patchFilters = useOrgStore((s) => s.patchFilters);
  const clearFilters = useOrgStore((s) => s.clearFilters);
  const selectedId = useOrgStore((s) => s.selectedId);
  const setSelectedId = useOrgStore((s) => s.setSelectedId);
  const { data, isLoading } = useOrgEmployees(filters);
  const filterData = useOrgFilters(filters);

  const FIELDS = [
    { key: "zone", label: "Zone", facet: "zones" },
    { key: "region", label: "Region", facet: "regions" },
    { key: "state", label: "State", facet: "states" },
    { key: "hq", label: "HQ", facet: "hqs" },
  ];

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Directory</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Search, filters, and the employee list.</p>
      </div>
      <div className="px-5 py-4 border-b border-slate-100 space-y-3">
        <input type="text" className="filter-select w-full" placeholder="Search by name, EMP ID, email, designation…"
          value={filters.q || ""} onChange={(e) => patchFilters({ q: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <select key={f.key} className="filter-select" value={filters[f.key] || ""} onChange={(e) => patchFilters({ [f.key]: e.target.value || undefined })}>
              <option value="">All {f.label}s</option>
              {filterData.data?.[f.facet]?.map((o) => <option key={o.value} value={o.value}>{o.value} ({o.count})</option>)}
            </select>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select className="filter-select" value={filters.role_id || ""} onChange={(e) => patchFilters({ role_id: e.target.value || undefined })}>
            <option value="">All Roles</option>
            {filterData.data?.roles?.map((r) => <option key={r.value} value={r.value}>{r.label} · L{r.level} ({r.count})</option>)}
          </select>
          <select className="filter-select" value={filters.level ?? ""} onChange={(e) => patchFilters({ level: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">All Levels</option>
            {filterData.data?.levels?.map((l) => <option key={l.value} value={l.value}>Level {l.value} ({l.count})</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 text-xs">
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={!!filters.vacant_only} onChange={(e) => patchFilters({ vacant_only: e.target.checked, filled_only: false })} />
            Vacant only
          </label>
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={!!filters.filled_only} onChange={(e) => patchFilters({ filled_only: e.target.checked, vacant_only: false })} />
            Filled only
          </label>
          <button type="button" className="text-pink-700 font-medium" onClick={clearFilters}>Clear all</button>
        </div>
      </div>
      <div>
        <div className="px-5 py-3 text-xs font-medium text-slate-500 sticky top-0 bg-white border-b border-slate-100 z-[1]">
          {isLoading ? "Loading…" : `${data?.count ?? 0} people`}
        </div>
        <div className="divide-y divide-slate-100">
          {data?.items?.map((emp) => (
            <div key={emp.id} className={`dir-card${emp.id === selectedId ? " selected" : ""}`} onClick={() => setSelectedId(emp.id)}>
              <div className={`dir-avatar${emp.is_vacant ? " vacant" : ""}`}>{emp.is_vacant ? "V" : initials(emp.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="dir-name truncate">{emp.name}</div>
                <div className="dir-meta truncate">{emp.role_name || emp.designation || "Unspecified"}{emp.emp_id ? ` · ${emp.emp_id}` : ""}</div>
                <div className="dir-tags">
                  <span className="tag level">L{emp.level}</span>
                  {emp.role_name && <span className={scopeClass(emp.scope)}>{scopeLabel(emp.scope)}</span>}
                  {emp.zone && <span className="tag zone">{emp.zone}</span>}
                  {emp.is_vacant && <span className="tag vacant">Vacant</span>}
                  {emp.added_manually && <span className="tag reports">Added</span>}
                  {emp.direct_reports > 0 && <span className="tag reports">{emp.direct_reports} reports</span>}
                  {emp.external_manager && <span className="tag ext">External boss</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── OrgTree ───────────────────────────────────────────────

function OrgTreePanel() {
  const selectedId = useOrgStore((s) => s.selectedId);
  const setSelectedId = useOrgStore((s) => s.setSelectedId);
  const subQ = useOrgSubtree(selectedId);
  const rootsQ = useOrgRoots();

  if (!selectedId) {
    return (
      <div className="text-sm text-slate-500">
        <p className="mb-2">Tip: click anyone in the directory to focus their team.</p>
        {rootsQ.data?.roots?.length > 0 && (
          <>
            <p className="mb-2">Top of org:</p>
            <ul className="space-y-1">
              {rootsQ.data.roots.map((r) => (
                <li key={r.id}><button type="button" className="ancestry-link" onClick={() => setSelectedId(r.id)}>{r.name} — {r.role_name}</button></li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }
  if (subQ.isLoading) return <div className="text-sm text-slate-500">Loading tree…</div>;
  if (!subQ.data) return null;
  return (
    <ul className="org-tree-list">
      <TreeLi node={subQ.data.root} />
    </ul>
  );
}

function TreeLi({ node }) {
  const [collapsed, setCollapsed] = useState(false);
  const selectedId = useOrgStore((s) => s.selectedId);
  const setSelectedId = useOrgStore((s) => s.setSelectedId);
  const hasChildren = node.children?.length > 0;

  return (
    <li className={collapsed ? "collapsed" : ""}>
      <div className={`tree-node${node.is_vacant ? " vacant" : ""}${node.id === selectedId ? " selected" : ""}`}>
        <div className={`tree-toggle${!hasChildren ? " empty" : ""}`} onClick={() => hasChildren && setCollapsed((c) => !c)}
          title={hasChildren ? (collapsed ? "Expand" : "Collapse") : ""} />
        <div className="tree-body" onClick={() => setSelectedId(node.id)}>
          <div className="flex items-start gap-2">
            <div className={`dir-avatar${node.is_vacant ? " vacant" : ""}`} style={{ width: 32, height: 32, fontSize: 11 }}>
              {node.is_vacant ? "V" : initials(node.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="tree-name truncate">{node.name}</div>
              <div className="tree-meta truncate">{node.role_name || node.designation || "Unspecified"}{node.emp_id ? ` · ${node.emp_id}` : ""}</div>
              <div className="tree-tags">
                <span className="tag level">L{node.level}</span>
                <span className={scopeClass(node.scope)}>{scopeLabel(node.scope)}</span>
                {node.zone && <span className="tag zone">{node.zone}</span>}
                {node.is_vacant && <span className="tag vacant">Vacant</span>}
                {node.added_manually && <span className="tag reports">Added</span>}
                {node.children?.length > 0 && <span className="tag reports">{node.children.length} reports · {node.total_descendants} total</span>}
                {node.external_manager && <span className="tag ext">External boss</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {hasChildren && <ul>{node.children.map((c) => <TreeLi key={c.id} node={c} />)}</ul>}
    </li>
  );
}

// ─── DetailPanel ───────────────────────────────────────────

function DetailPanel() {
  const selectedId = useOrgStore((s) => s.selectedId);
  const setSelectedId = useOrgStore((s) => s.setSelectedId);
  const openDialog = useOrgStore((s) => s.openDialog);
  const empQ = useOrgEmployee(selectedId);
  const ancQ = useOrgAncestry(selectedId);
  const setManagerMut = useSetManager();
  const reassignMut = useReassignReports();

  if (!selectedId) return <div className="px-5 py-8 text-sm text-slate-500 leading-relaxed">Pick someone from the directory or the org tree to see their full record here.</div>;
  if (empQ.isLoading || !empQ.data) return <div className="px-5 py-8 text-sm text-slate-500">Loading…</div>;

  const emp = empQ.data.employee;

  return (
    <div className="min-w-0 flex flex-col flex-1">
      <div className="px-6 pt-6 pb-5 border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className={`dir-avatar shrink-0${emp.is_vacant ? " vacant" : ""}`}>{emp.is_vacant ? "V" : initials(emp.name)}</div>
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 break-words leading-snug" title={emp.name}>{emp.name}</h2>
            <p className="text-sm text-slate-500 break-words leading-relaxed">{emp.role_name || emp.designation || "Unspecified"}{emp.emp_id ? ` · ${emp.emp_id}` : ""}</p>
            <div className="dir-tags pt-1">
              <span className="tag level">L{emp.level}</span>
              <span className={scopeClass(emp.scope)}>{scopeLabel(emp.scope)}</span>
              {emp.zone && <span className="tag zone">{emp.zone}</span>}
              {emp.is_vacant && <span className="tag vacant">Vacant</span>}
              {emp.added_manually && <span className="tag reports">Added</span>}
              {emp.direct_reports > 0 && <span className="tag reports">{emp.direct_reports} reports</span>}
              {emp.external_manager && <span className="tag ext">External boss</span>}
            </div>
          </div>
          <button type="button" className="action-btn shrink-0 self-start" onClick={() => setSelectedId(null)} title="Clear selection">×</button>
        </div>
      </div>
      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 min-w-0">
          <Field label="EMP ID" value={emp.emp_id} />
          <div className="field col-span-2 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="label">Official email (from sheet)</div>
              <button type="button" className="text-xs text-blue-600 hover:underline"
                onClick={() => openDialog({ kind: "edit-employee-email", subjectId: emp.id, initialEmail: emp.official_email || "" })}>Edit</button>
            </div>
            <div className={`value${!emp.official_email ? " muted" : ""}`}>{emp.official_email || "—"}</div>
          </div>
          <Field label="Designation" value={emp.designation} />
          <Field label="Manager" value={emp.manager?.name || emp.external_manager || "—"} />
          <Field label="Role · Level · Scope" value={`${emp.role_name} · L${emp.level} · ${scopeLabel(emp.scope)}`} />
          <Field label="HQ" value={emp.hq} />
          <Field label="Zone" value={emp.zone} />
          <Field label="Region" value={emp.region} />
          <Field label="State" value={emp.state} />
          <Field label="DOJ" value={emp.doj} />
          <Field label="DOB" value={emp.dob} />
          <Field label="Gender" value={emp.gender} />
          <Field label="Reporting Manager (raw)" value={emp.reporting_manager_raw} />
        </div>
        {ancQ.data?.ancestry?.length > 0 && (
          <div className="text-xs text-slate-500 leading-relaxed pt-5 mt-2 border-t border-slate-100">
            <span className="text-slate-400">Reporting line: </span>
            {ancQ.data.ancestry.map((a, idx) => (
              <span key={a.id}>
                {idx > 0 && <span className="mx-1 text-slate-300">›</span>}
                {a.id === emp.id ? <span className="font-semibold text-slate-700">{a.name}</span>
                  : <button type="button" className="ancestry-link" onClick={() => setSelectedId(a.id)}>{a.name}</button>}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-6 py-5 border-t border-slate-100 flex flex-wrap gap-3">
        <button type="button" className="action-btn"
          onClick={() => openDialog({ kind: "picker", title: `Choose new manager for ${emp.name}`, subtitle: "The cycle detection will block self-loops automatically.", excludeIds: [emp.id],
            onPick: (id) => setManagerMut.mutate({ id: emp.id, manager_id: id }) })}>
          Edit reporting line
        </button>
        <button type="button" className="action-btn" onClick={() => openDialog({ kind: "role-change", subjectId: emp.id })}>
          Change role
        </button>
        <button type="button" className="action-btn"
          onClick={() => {
            if (emp.direct_reports === 0) { toast("No direct reports to reassign."); return; }
            openDialog({ kind: "picker", title: `Reassign all reports of ${emp.name}`,
              subtitle: `${emp.direct_reports} report${emp.direct_reports === 1 ? "" : "s"} will move under the chosen person.`,
              excludeIds: [emp.id],
              onPick: (id) => { if (id) reassignMut.mutate({ from_id: emp.id, to_id: id }); } });
          }}>
          Reassign reports…
        </button>
        <button type="button" className="action-btn"
          onClick={() => openDialog({ kind: "add-employee", defaults: { name: "", manager_id: emp.id, role_id: emp.role_id, hq: emp.hq, zone: emp.zone, region: emp.region, state: emp.state } })}>
          + Add direct report
        </button>
        <button type="button" className="action-btn" onClick={() => openDialog({ kind: "replace", subjectId: emp.id })}>
          Replace
        </button>
        <button type="button" className="action-btn danger" onClick={() => openDialog({ kind: "leave", subjectId: emp.id })}>
          Mark as left
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div className="field min-w-0">
      <div className="label">{label}</div>
      <div className={`value${empty ? " muted" : ""}`} title={empty ? undefined : String(value)}>{empty ? "—" : value}</div>
    </div>
  );
}

// ─── RolesView ─────────────────────────────────────────────

function RolesView() {
  const rolesQ = useOrgRoles();
  const createRoleMut = useCreateRole();
  const autoDetectMut = useAutoDetectRoles();
  const resetAllMut = useResetAllRoles();
  const updateRoleMut = useUpdateRole();
  const resetRoleMut = useResetRole();
  const expandedRoles = useOrgStore((s) => s.expandedRoles);
  const toggleRoleExpansion = useOrgStore((s) => s.toggleRoleExpansion);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Roles</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-prose">
            Levels and scopes are inferred from the data. Override anything you want; click a role's people count to manage members.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="org-btn-secondary" disabled={resetAllMut.isPending}
            onClick={() => { if (!confirm("Reset all roles? Your level/scope overrides and any role renames will be lost.")) return; resetAllMut.mutate(); }}>
            {resetAllMut.isPending ? "Resetting…" : "Reset all roles"}
          </button>
          <button type="button" className="org-btn-secondary" disabled={autoDetectMut.isPending} onClick={() => autoDetectMut.mutate()}>
            {autoDetectMut.isPending ? "Detecting…" : "Re-detect from data"}
          </button>
          <button type="button" className="org-btn-primary"
            onClick={() => { const name = prompt("Role name (e.g. National Sales Head):"); if (name) createRoleMut.mutate({ name, aliases: [name.toUpperCase()] }); }}>
            + Add role
          </button>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="roles-table">
          <thead><tr><th>Role</th><th>Aliases</th><th>Level</th><th>Scope</th><th>People in this role</th></tr></thead>
          <tbody>
            {rolesQ.isLoading && <tr><td colSpan={5} className="empty-row">Loading roles…</td></tr>}
            {!rolesQ.isLoading && !rolesQ.data?.roles?.length && <tr><td colSpan={5} className="empty-row">No roles yet — click "Re-detect from data".</td></tr>}
            {rolesQ.data?.roles?.map((role) => (
              <RoleRow key={role.id} role={role} expanded={expandedRoles.has(role.id)} toggleExpanded={() => toggleRoleExpansion(role.id)}
                updateRoleMut={updateRoleMut} resetRoleMut={resetRoleMut} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleRow({ role, expanded, toggleExpanded, updateRoleMut, resetRoleMut }) {
  const [name, setName] = useState(role.name);
  const [overrideLevel, setOverrideLevel] = useState(role.override?.level != null ? String(role.override.level) : "");
  const [overrideScope, setOverrideScope] = useState(role.override?.scope || "");
  const dirty = name !== role.name || String(role.override?.level ?? "") !== overrideLevel || String(role.override?.scope || "") !== overrideScope;

  const onCommit = () => {
    if (!dirty) return;
    const patch = {};
    if (name !== role.name) patch.name = name;
    patch.override = { level: overrideLevel === "" ? null : Number(overrideLevel), scope: overrideScope || null };
    updateRoleMut.mutate({ id: role.id, ...patch });
  };

  return (
    <>
      <tr className={`role-row${expanded ? " open" : ""}`}>
        <td><input className="role-name-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} /></td>
        <td><div className="alias-list">{role.aliases?.map((a) => <span key={a} className="alias-chip">{a}</span>)}</div></td>
        <td>
          <input type="number" className="override-level" placeholder={String(role.auto?.level)} value={overrideLevel}
            onChange={(e) => setOverrideLevel(e.target.value)} onBlur={onCommit} />
          <span className="text-xs text-slate-500 ml-1">auto: {role.auto?.level}</span>
        </td>
        <td>
          <select className="override-select" value={overrideScope} onChange={(e) => { setOverrideScope(e.target.value); setTimeout(onCommit, 0); }}>
            <option value="">— auto: {scopeLabel(role.auto?.scope)} —</option>
            {SCOPES.map((s) => <option key={s} value={s}>{scopeLabel(s)}</option>)}
          </select>
          {(role.override?.level != null || role.override?.scope) && (
            <button type="button" className="ml-2 text-xs text-pink-700" onClick={() => resetRoleMut.mutate(role.id)}>reset</button>
          )}
        </td>
        <td>
          <button type="button" className={`role-count-btn${expanded ? " open" : ""}`} onClick={toggleExpanded}>
            <span className="role-count-num">{role.employeeCount}</span>
            <span className="role-count-label">people</span>
            <span className="role-count-chev">{expanded ? "▾" : "▸"}</span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="role-members"><td colSpan={5}>
          <div className="role-members-body"><RoleMembersPanel role={role} /></div>
        </td></tr>
      )}
    </>
  );
}

function RoleMembersPanel({ role }) {
  const [q, setQ] = useState("");
  const setSelectedId = useOrgStore((s) => s.setSelectedId);
  const setTab = useOrgStore((s) => s.setTab);
  const openDialog = useOrgStore((s) => s.openDialog);
  const setManagerMut = useSetManager();
  const { data, isLoading } = useOrgEmployees({ role_id: role.id, q: q || undefined });

  const focus = (id) => { setSelectedId(id); setTab("org-explorer"); };
  const addPerson = () => openDialog({ kind: "add-employee", defaults: { name: "", role_id: role.id } });

  return (
    <div>
      <div className="members-header">
        <div>
          <div className="members-title">{role.name}</div>
          <div className="members-subtitle">
            L{role.effectiveLevel} · {scopeLabel(role.effectiveScope)} · {role.employeeCount} people
            {role.aliases?.length > 0 && ` · matches: ${role.aliases.join(", ")}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" className="filter-select" placeholder="Search in this role…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="org-btn-primary" onClick={addPerson}>+ Add person</button>
        </div>
      </div>
      {isLoading && <div className="text-sm text-slate-500">Loading members…</div>}
      {!isLoading && !data?.items?.length && <div className="members-empty">No one in this role yet. Use "Add person" to assign someone manually.</div>}
      <div className="members-grid">
        {data?.items?.map((m) => (
          <div key={m.id} className={`member-card${m.is_vacant ? " vacant" : ""}`}>
            <div className="member-top">
              <div className={`member-avatar${m.is_vacant ? " vacant" : ""}`}>{m.is_vacant ? "V" : initials(m.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="member-name truncate">{m.name}</div>
                <div className="member-meta">{m.designation || "—"}{m.emp_id && <> · <span className="member-empid">{m.emp_id}</span></>}</div>
                <div className="member-mgr truncate">{m.manager?.name ? `Reports to ${m.manager.name}` : "No manager"}</div>
              </div>
              <button type="button" className="member-focus-btn" title="Open Org explorer tab with this person selected" onClick={() => focus(m.id)}>↗</button>
            </div>
            <div className="member-tags">
              {m.zone && <span className="tag zone">{m.zone}</span>}
              {m.hq && <span className="tag">{m.hq}</span>}
              {m.is_vacant && <span className="tag vacant">Vacant</span>}
              {m.direct_reports > 0 && <span className="tag reports">{m.direct_reports} reports</span>}
              <span className={scopeClass(m.scope)}>{scopeLabel(m.scope)}</span>
            </div>
            <div className="member-actions">
              <button type="button" className="action-btn" onClick={() => openDialog({ kind: "replace", subjectId: m.id })}>Replace</button>
              <button type="button" className="action-btn"
                onClick={() => openDialog({ kind: "picker", title: `Move ${m.name} under another manager`, excludeIds: [m.id],
                  onPick: (id) => { if (id) setManagerMut.mutate({ id: m.id, manager_id: id }); } })}>
                Move under…
              </button>
              <button type="button" className="action-btn" onClick={() => openDialog({ kind: "add-employee", defaults: { name: "", role_id: role.id, manager_id: m.manager_id } })}>+ Add new</button>
              <button type="button" className="action-btn danger" onClick={() => openDialog({ kind: "leave", subjectId: m.id })}>Mark as left</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────

function ModalRoot() {
  const dialog = useOrgStore((s) => s.dialog);
  const closeDialog = useOrgStore((s) => s.closeDialog);
  if (dialog.kind === "none") return null;
  switch (dialog.kind) {
    case "picker": return <PickerModal dialog={dialog} close={closeDialog} />;
    case "role-change": return <RoleChangeModal dialog={dialog} close={closeDialog} />;
    case "leave": return <LeaveModal dialog={dialog} close={closeDialog} />;
    case "add-employee": return <AddEmployeeModal dialog={dialog} close={closeDialog} />;
    case "replace": return <ReplaceModal dialog={dialog} close={closeDialog} />;
    case "edit-employee-email": return <EditEmailModal dialog={dialog} close={closeDialog} />;
    case "removed-list": return <RemovedListModal close={closeDialog} />;
    default: return null;
  }
}

function Dialog({ title, subtitle, large, footer, children, close }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="org-dialog-backdrop" onClick={close}>
      <div className={`org-dialog${large ? " org-dialog-lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="org-dialog-header">
          <div>
            <div className="font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="text-slate-500 hover:text-slate-700">×</button>
        </div>
        <div className="org-dialog-body">{children}</div>
        {footer && <div className="org-dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

function PickerModal({ dialog, close }) {
  const [q, setQ] = useState("");
  const [pickedId, setPickedId] = useState(null);
  const [restrictToRole, setRestrictToRole] = useState(!!dialog.preFilterRoleId);
  const { data, isLoading } = useOrgEmployees({
    q: q || undefined,
    role_id: restrictToRole ? dialog.preFilterRoleId || undefined : undefined,
  });
  const items = useMemo(() => {
    const list = data?.items || [];
    const exclude = new Set(dialog.excludeIds || []);
    return list.filter((e) => !exclude.has(e.id) && !e.is_vacant);
  }, [data, dialog.excludeIds]);

  return (
    <Dialog title={dialog.title} subtitle={dialog.subtitle} large close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary" disabled={!pickedId} onClick={() => { dialog.onPick(pickedId); close(); }}>Confirm</button>
      </>}>
      <input type="text" className="filter-select w-full" autoFocus placeholder="Search by name, EMP ID, email, designation…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {dialog.preFilterRoleId && (
        <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
          <input type="checkbox" checked={restrictToRole} onChange={(e) => setRestrictToRole(e.target.checked)} />
          Limit to people in the same role
        </label>
      )}
      <div className="picker-list mt-3">
        {isLoading && <div className="picker-row text-slate-500">Loading…</div>}
        {!isLoading && !items.length && <div className="picker-row text-slate-500">No matches.</div>}
        {items.slice(0, 200).map((emp) => (
          <div key={emp.id} className={`picker-row${pickedId === emp.id ? " selected" : ""}`} onClick={() => setPickedId(emp.id)}>
            <div className="flex items-center gap-2">
              <div className="dir-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(emp.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="picker-row-name truncate">{emp.name}</div>
                <div className="picker-row-meta truncate">{emp.role_name || emp.designation}{emp.emp_id ? ` · ${emp.emp_id}` : ""}{emp.zone ? ` · ${emp.zone}` : ""}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function RoleChangeModal({ dialog, close }) {
  const empQ = useOrgEmployee(dialog.subjectId);
  const rolesQ = useOrgRoles();
  const setRoleMut = useSetRole();
  const [roleId, setRoleId] = useState("");

  if (!empQ.data) return null;
  const emp = empQ.data.employee;
  const currentRoleId = emp.role_id || "";
  const effective = roleId || currentRoleId;
  const sorted = [...(rolesQ.data?.roles || [])].sort((a, b) => b.effectiveLevel - a.effectiveLevel || a.name.localeCompare(b.name));

  return (
    <Dialog title={`Change role · ${emp.name}`} subtitle={`Currently ${emp.role_name} (L${emp.level} · ${scopeLabel(emp.scope)})`} close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary" disabled={!effective || effective === currentRoleId || setRoleMut.isPending}
          onClick={() => setRoleMut.mutate({ id: dialog.subjectId, role_id: effective }, { onSuccess: close })}>
          {setRoleMut.isPending ? "Saving…" : "Save"}
        </button>
      </>}>
      <select className="filter-select w-full" value={effective} onChange={(e) => setRoleId(e.target.value)}>
        {sorted.map((r) => <option key={r.id} value={r.id}>{r.name} · L{r.effectiveLevel} · {scopeLabel(r.effectiveScope)}</option>)}
      </select>
      <p className="text-xs text-slate-500 mt-2">Per-person role overrides survive a workbook re-import — the role engine respects this person's pinned choice.</p>
    </Dialog>
  );
}

function LeaveModal({ dialog, close }) {
  const empQ = useOrgEmployee(dialog.subjectId);
  const allQ = useOrgEmployees({});
  const markLeftMut = useMarkLeft();
  const [reassignTo, setReassignTo] = useState("default");

  if (!empQ.data) return null;
  const emp = empQ.data.employee;
  const candidates = (allQ.data?.items || []).filter((e) => e.id !== emp.id && !e.is_vacant);

  return (
    <Dialog title={`Mark ${emp.name} as left`}
      subtitle={`${emp.direct_reports} direct report${emp.direct_reports === 1 ? "" : "s"} need${emp.direct_reports === 1 ? "s" : ""} a new manager.`}
      large close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary danger" disabled={markLeftMut.isPending}
          onClick={() => {
            let target = null;
            if (reassignTo === "orphan") target = null;
            else if (reassignTo === "default") target = emp.manager_id || null;
            else target = reassignTo;
            markLeftMut.mutate({ id: emp.id, reassign_to: target }, { onSuccess: close });
          }}>
          {markLeftMut.isPending ? "Working…" : "Confirm leave"}
        </button>
      </>}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">Reassign reports to</label>
      <select className="filter-select w-full" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
        <option value="default">Default — bump to {emp.manager?.name || "their manager"} (or orphan if no manager)</option>
        <option value="orphan">Orphan (no manager — they become roots)</option>
        <optgroup label="Pick someone specific">
          {candidates.slice(0, 200).map((c) => (
            <option key={c.id} value={c.id}>{c.name} · {c.role_name}{c.zone ? ` · ${c.zone}` : ""}</option>
          ))}
        </optgroup>
      </select>
      <p className="text-xs text-slate-500 mt-2">You can restore this person later from the "Removed people" list (the red pill in the header).</p>
    </Dialog>
  );
}

function AddEmployeeModal({ dialog, close }) {
  const rolesQ = useOrgRoles();
  const peopleQ = useOrgEmployees({});
  const addEmpMut = useAddEmployee();
  const d = dialog.defaults || {};
  const [name, setName] = useState(d.name || "");
  const [empId, setEmpId] = useState("");
  const [roleId, setRoleId] = useState(d.role_id || "");
  const [managerId, setManagerId] = useState(d.manager_id || "");
  const [hq, setHq] = useState(d.hq || "");
  const [zone, setZone] = useState(d.zone || "");
  const [region, setRegion] = useState(d.region || "");
  const [state, setState] = useState(d.state || "");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [doj, setDoj] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  const onSave = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const ce = email.trim().toLowerCase();
    if (ce && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) { toast.error("Enter a valid email or leave blank"); return; }
    addEmpMut.mutate({
      name: name.trim(), emp_id: empId.trim() || undefined, contact_email: ce || undefined,
      designation: designation.trim() || undefined, role_id: roleId || undefined, manager_id: managerId || undefined,
      hq: hq || undefined, zone: zone || undefined, region: region || undefined, state: state || undefined,
      doj: doj || undefined, dob: dob || undefined, gender: gender || undefined,
    }, { onSuccess: close });
  };

  return (
    <Dialog title="Add a person" subtitle="Manually-added people survive a workbook re-import via their EMP ID."
      large close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary" disabled={addEmpMut.isPending} onClick={onSave}>
          {addEmpMut.isPending ? "Adding…" : "Add person"}
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <ModalField label="Full name *" value={name} onChange={setName} autoFocus />
        <ModalField label="EMP ID" value={empId} onChange={setEmpId} placeholder="auto-generated if blank" />
        <div className="col-span-2"><ModalField label="Email (optional)" value={email} onChange={setEmail} placeholder="Work email — shown in org details & used for login when set" /></div>
        <div className="col-span-2"><ModalField label="Designation" value={designation} onChange={setDesignation} placeholder="Job title / designation" /></div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
          <select className="filter-select w-full" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">— pick a role —</option>
            {rolesQ.data?.roles?.map((r) => <option key={r.id} value={r.id}>{r.name} · L{r.effectiveLevel} · {scopeLabel(r.effectiveScope)}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reports to</label>
          <select className="filter-select w-full" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— no manager (will be a root) —</option>
            {(peopleQ.data?.items || []).filter((p) => !p.is_vacant).slice(0, 500).map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.role_name}{p.zone ? ` · ${p.zone}` : ""}</option>
            ))}
          </select>
        </div>
        <ModalField label="HQ" value={hq} onChange={setHq} />
        <ModalField label="Zone" value={zone} onChange={setZone} />
        <ModalField label="Region" value={region} onChange={setRegion} />
        <ModalField label="State" value={state} onChange={setState} />
        <ModalField label="Date of joining" value={doj} onChange={setDoj} placeholder="YYYY-MM-DD" />
        <ModalField label="Date of birth" value={dob} onChange={setDob} placeholder="YYYY-MM-DD" />
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Gender</label>
          <select className="filter-select w-full" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">— unspecified —</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
    </Dialog>
  );
}

function ReplaceModal({ dialog, close }) {
  const empQ = useOrgEmployee(dialog.subjectId);
  const replaceMut = useReplacePerson();
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");

  if (!empQ.data) return null;
  const emp = empQ.data.employee;

  return (
    <Dialog title={`Replace ${emp.name}`}
      subtitle={`The new person inherits ${emp.name}'s role, manager, and geography. ${emp.direct_reports} direct report${emp.direct_reports === 1 ? "" : "s"} will move under them, and ${emp.name} will be marked as left.`}
      close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary" disabled={!name.trim() || replaceMut.isPending}
          onClick={() => {
            if (!name.trim()) { toast.error("Name is required"); return; }
            const ce = email.trim().toLowerCase();
            if (ce && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) { toast.error("Enter a valid email or leave blank"); return; }
            replaceMut.mutate({ id: emp.id, payload: { name: name.trim(), emp_id: empId.trim() || undefined, contact_email: ce || undefined } }, { onSuccess: close });
          }}>
          {replaceMut.isPending ? "Working…" : "Replace"}
        </button>
      </>}>
      <div className="space-y-3">
        <ModalField label="New person's name *" value={name} onChange={setName} autoFocus />
        <ModalField label="EMP ID" value={empId} onChange={setEmpId} placeholder="Optional — auto-generated if blank" />
        <ModalField label="Email (optional)" value={email} onChange={setEmail} placeholder="Work email for the new person" />
        <p className="text-xs text-slate-500">You can edit role / manager / geography afterwards from the detail panel.</p>
      </div>
    </Dialog>
  );
}

function EditEmailModal({ dialog, close }) {
  const refresh = useRefreshAll();
  const [value, setValue] = useState(dialog.initialEmail || "");

  return (
    <Dialog title="Official email"
      subtitle="Official / work email for the org directory (from Excel on upload). Clearing removes it until the next workbook import."
      close={close}
      footer={<>
        <button type="button" className="org-btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className="org-btn-primary"
          onClick={() => {
            const trimmed = value.trim().toLowerCase();
            if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { toast.error("Enter a valid email or leave empty to clear official email"); return; }
            api.put(`/org/employees/${dialog.subjectId}`, { contact_email: trimmed || null }).then(() => {
              toast.success(trimmed ? "Official email saved" : "Official email cleared");
              refresh();
              close();
            }).catch((e) => toast.error(e?.response?.data?.message || "Update failed"));
          }}>
          Save
        </button>
      </>}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">Official email</label>
      <input type="email" className="filter-select w-full" value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="name@company.com" autoComplete="email" />
    </Dialog>
  );
}

function RemovedListModal({ close }) {
  const { data, isLoading } = useOrgRemoved();
  const restoreMut = useRestore();

  return (
    <Dialog title="People marked as left" subtitle="Restore brings them back with their last manager and role intact."
      large close={close}
      footer={<button type="button" className="org-btn-secondary" onClick={close}>Done</button>}>
      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {!isLoading && !data?.items?.length && <div className="text-sm text-slate-500">Nobody is currently marked as left.</div>}
      <div className="removed-list">
        {data?.items?.map((p) => (
          <div key={p.id} className="removed-row">
            <div className="removed-avatar">{initials(p.name)}</div>
            <div className="flex-1 min-w-0">
              <div className="removed-name truncate">{p.name}</div>
              <div className="removed-meta truncate">{p.role_name || p.designation || "Unspecified"}{p.emp_id ? ` · ${p.emp_id}` : ""}{p.zone ? ` · ${p.zone}` : ""}</div>
              {p.last_manager_name && <div className="removed-mgr truncate">Last reported to {p.last_manager_name}</div>}
              <div className="removed-tags">
                {p.direct_reports > 0 && <span className="tag reports">{p.direct_reports} reports were waiting</span>}
              </div>
            </div>
            <button type="button" className="removed-restore-btn" disabled={restoreMut.isPending}
              onClick={() => restoreMut.mutate({ id: p.id }, { onSuccess: () => toast.success(`${p.name} restored`) })}>
              Restore
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function ModalField({ label, value, onChange, placeholder, autoFocus }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input type="text" className="filter-select w-full" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
