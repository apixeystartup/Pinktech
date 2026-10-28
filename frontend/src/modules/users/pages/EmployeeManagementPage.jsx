import { useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";
import "../../../styles/wf-employees.css";

const adminBadgeStyle = {
  display: "inline-block",
  padding: "1px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: "#1c7a45",
  background: "#cee4d2",
  border: "1px solid #b7dfc6",
  marginLeft: 8,
  verticalAlign: "middle",
};

const vacantBadgeStyle = {
  ...adminBadgeStyle,
  color: "#a45a11",
  background: "#fbe6cf",
  border: "1px solid #f3d5b3",
};

const STATUS_TABS = ["ALL", "ACTIVE", "INVITED", "LOCKED", "DISABLED"];

function statusLabel(status) {
  if (!status) return "—";
  if (status === "LOCKED") return "Temporarily deactivated";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusTone(status) {
  if (status === "ACTIVE") return "active";
  if (status === "INVITED") return "invited";
  if (status === "DISABLED") return "disabled";
  if (status === "LOCKED") return "disabled";
  return "neutral";
}

function SearchIcon() {
  return (
    <svg className="emp-search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function EmployeeManagementPage({ embedded = false }) {
  const { showToast } = useToast();
  const { user, isSuperAdmin, accountRole } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetRequestIds, setResetRequestIds] = useState(new Set());

  const canAssign = Boolean(isSuperAdmin) || accountRole === "tenant_admin";
  const currentUserId = String(user?.id || user?._id || "");
  const isProtectedAccount = (row) =>
    !isSuperAdmin
    && (Boolean(row.isTenantAdmin) || String(row._id) === currentUserId);

  const load = async () => {
    if (!canAssign) return;
    setLoading(true);
    try {
      const { data } = await api.get("/users?showAll=true");
      if (!Array.isArray(data)) {
        throw new Error("The employee account service returned an unexpected response.");
      }
      const users = data.filter((e) => e.email !== "superadmin@example.com");
      setEmployees(users);
      setResetRequestIds(
        new Set(users.filter((user) => user.passwordResetRequestedAt).map((user) => String(user._id))),
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = async () => {
    if (!canAssign) return;
    try {
      const { data } = await api.get("/tenants");
      if (!Array.isArray(data)) {
        throw new Error("The tenant service returned an unexpected response.");
      }
      setTenants(data);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  useEffect(() => {
    load();
    loadTenants();
    const onFocus = () => {
      load();
      loadTenants();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (!q) return true;
      return [e.name, e.email, e.empCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [employees, statusFilter, query]);

  const tenantOfRow = (row) =>
    tenants.find((t) => String(t._id) === String(row.tenantId)) || null;

  const adminTenantOfRow = (row) => {
    const byAdmin = tenants.find((t) => String(t.adminUserId || "") === String(row._id));
    if (byAdmin) return byAdmin;
    return tenants.find(
      (t) => String(t._id) === String(row.tenantId) && t.email && t.email === row.email
    ) || null;
  };

  const tenantHasAdmin = (tenant) =>
    Boolean(tenant && (tenant.adminUserId || tenant.email));

  const adminBadge = (row) => {
    if (!canAssign) return null;
    if (row.isTenantAdmin) {
      return <span style={adminBadgeStyle} title="Tenant administrator account">Admin</span>;
    }
    const adminTenant = adminTenantOfRow(row);
    if (adminTenant) {
      return (
        <span style={adminBadgeStyle} title={`Admin of ${adminTenant.name}`}>
          Admin
        </span>
      );
    }
    const owner = tenantOfRow(row);
    if (owner && !tenantHasAdmin(owner)) {
      return <span style={vacantBadgeStyle}>Vacant</span>;
    }
    return null;
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filtered.filter((employee) => !isProtectedAccount(employee));
    if (selectable.every((employee) => selected.has(employee._id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((employee) => employee._id)));
    }
  };

  const sendCreds = async (userIds) => {
    const permittedIds = userIds.filter((id) => {
      const target = employees.find((employee) => String(employee._id) === String(id));
      return target && !isProtectedAccount(target);
    });
    if (!permittedIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let sent = 0;
      for (const id of permittedIds) {
        await api.post(`/users/${id}/send-creds`);
        sent++;
      }
      showToast(`Credentials sent to ${sent} employee(s)`, "success");
      await load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const resetCreds = async (userIds) => {
    const permittedIds = userIds.filter((id) => {
      const target = employees.find((employee) => String(employee._id) === String(id));
      return target && !isProtectedAccount(target);
    });
    if (!permittedIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let reset = 0;
      for (const id of permittedIds) {
        await api.post(`/users/${id}/reset-creds`);
        reset++;
      }
      showToast(`Credentials reset for ${reset} employee(s)`, "success");
      await load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const activateAccount = async (userId) => {
    const target = employees.find((employee) => String(employee._id) === String(userId));
    if (!target || isProtectedAccount(target)) {
      showToast("Tenant admin accounts can only be managed by the platform super admin.", "error");
      return;
    }
    try {
      await api.post(`/users/${userId}/unlock`);
      showToast("Account activated; failed-login attempts were reset.", "success");
      await load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const formatRoles = (roleIds) => {
    if (!roleIds || !roleIds.length) return "—";
    return roleIds.map((r) => r.name || r).join(", ");
  };

  const actionFor = (row) => ({
    label: resetRequestIds.has(String(row._id))
      ? "Resend creds"
      : row.status === "LOCKED"
        ? "Activate"
        : row.status === "INVITED"
          ? "Resend creds"
          : "Send creds",
    tone: statusTone(row.status),
    restricted: isProtectedAccount(row),
    onClick: () =>
      row.status === "LOCKED" && !resetRequestIds.has(String(row._id))
        ? activateAccount(row._id)
        : sendCreds([row._id]),
  });

  const columns = [
    {
      key: "_select",
      label: (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={
            filtered.some((employee) => !isProtectedAccount(employee))
            && filtered.filter((employee) => !isProtectedAccount(employee))
              .every((employee) => selected.has(employee._id))
          }
          onChange={toggleSelectAll}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          checked={selected.has(row._id)}
          disabled={isProtectedAccount(row)}
          onChange={() => toggleSelect(row._id)}
        />
      ),
    },
    {
      key: "name",
      label: "Name",
      render: (row) => (
        <span className="emp-name">
          {row.name}
          {adminBadge(row)}
        </span>
      ),
    },
    { key: "email", label: "Email" },
    { key: "empCode", label: "Emp ID" },
    { key: "roles", label: "Roles", render: (row) => formatRoles(row.roleIds) },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span>
          <span className={`emp-status emp-status--${statusTone(row.status)}`}>
            {statusLabel(row.status)}
          </span>
          {row.status === "LOCKED" && row.lockUntil ? (
            <span className="emp-card-label">Until {new Date(row.lockUntil).toLocaleString()}</span>
          ) : null}
          {resetRequestIds.has(String(row._id)) ? (
            <span className="emp-status emp-status--invited">Reset requested</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "send",
      label: "Actions",
      render: (row) => {
        const action = actionFor(row);
        if (action.restricted) {
          return <span className="emp-card-label">Admin account protected</span>;
        }
        return (
          <button
            type="button"
            className={`emp-send emp-send--${action.tone}`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        );
      },
    },
  ];

  const content = (
    <div className="emp-page">
        <div className="emp-toolbar">
          <div className="emp-tabs" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={statusFilter === s}
                className={`emp-tab${statusFilter === s ? " is-active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <button type="button" className="emp-refresh" onClick={load}>
            Refresh
          </button>
        </div>

        {selected.size > 0 ? (
          <div className="emp-bulk">
            <button type="button" className="emp-bulk-btn" onClick={() => sendCreds([...selected])}>
              Send Creds ({selected.size})
            </button>
            <button type="button" className="emp-bulk-btn" onClick={() => resetCreds([...selected])}>
              Reset Creds ({selected.size})
            </button>
            <button type="button" className="emp-bulk-clear" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        ) : null}

        <div className="emp-search">
          <SearchIcon />
          <input
            type="text"
            className="emp-search-input"
            placeholder="Search by name, email, or employee ID…"
            aria-label="Search employees"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button type="button" className="emp-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          ) : null}
        </div>

        <div className="emp-table-wrap">
          <DataTable
            columns={columns}
            rows={filtered}
            emptyText={loading ? "Loading employees…" : "No employees match this view."}
          />
        </div>

        {/* Mobile: stacked employee cards (Screen 10). */}
        <div className="emp-cards">
          {filtered.length === 0 ? (
            <p className="emp-cards-empty">
              {loading ? "Loading employees…" : "No employees match this view."}
            </p>
          ) : (
            filtered.map((row) => {
              const action = actionFor(row);
              return (
                <article key={row._id} className="emp-card">
                  <div className="emp-card-top">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row._id)}
                      disabled={isProtectedAccount(row)}
                      onChange={() => toggleSelect(row._id)}
                    />
                    <span className="emp-card-name">{row.name}</span>
                    <span className={`emp-status emp-status--${statusTone(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                    {row.status === "LOCKED" && row.lockUntil ? (
                      <span className="emp-card-label">Until {new Date(row.lockUntil).toLocaleString()}</span>
                    ) : null}
                    {resetRequestIds.has(String(row._id)) ? (
                      <span className="emp-status emp-status--invited">Reset requested</span>
                    ) : null}
                  </div>
                  <div className="emp-card-email">{row.email}</div>
                  <div className="emp-card-meta">
                    <div className="emp-card-field">
                      <span className="emp-card-label">Employee ID</span>
                      <span className="emp-card-value">{row.empCode || "—"}</span>
                    </div>
                    <div className="emp-card-field">
                      <span className="emp-card-label">Role</span>
                      <span className="emp-card-value">{formatRoles(row.roleIds)}</span>
                    </div>
                    {action.restricted ? (
                      <span className="emp-card-label">Admin account protected</span>
                    ) : (
                      <button
                        type="button"
                        className={`emp-send emp-send--${action.tone} emp-card-action`}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
    </div>
  );

  if (!canAssign) {
    const message = (
      <p role="alert" className="text-sm text-slate-600">
        Only administrators can manage employee accounts.
      </p>
    );
    if (embedded) return message;
    return (
      <ModulePage title="Employee Management" description="Manage employee accounts for your organization.">
        {message}
      </ModulePage>
    );
  }

  if (embedded) return content;

  return (
    <ModulePage
      title="Employee Management"
      description="Manage employees, assign tenant admin accounts, send credentials, and reset passwords."
    >
      {content}
    </ModulePage>
  );
}

export default EmployeeManagementPage;
