import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { getErrorMessage } from "../lib/error";
import ModulePage from "../components/common/ModulePage";
import TenantScopeBanner from "../components/common/TenantScopeBanner";
import { useToast } from "../components/common/ToastProvider";
import useAuth from "../hooks/useAuth";

function EmployeeManagementPage() {
  const { showToast } = useToast();
  const { tenantContextId, permissionCodes = [] } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [credsResult, setCredsResult] = useState(null);

  const canSendCreds = permissionCodes.includes("user.send-credentials") || permissionCodes.includes("tenant.manage");

  const loadData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([api.get("/users"), api.get("/roles")]);
      setUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, tenantContextId]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.empCode || "").toLowerCase().includes(q)
      );
    }
    if (roleFilter) {
      list = list.filter((u) => (u.roleIds || []).some((r) => String(r._id || r) === roleFilter));
    }
    if (statusFilter) {
      list = list.filter((u) => u.status === statusFilter);
    }
    return list;
  }, [users, search, roleFilter, statusFilter]);

  const selectableIds = useMemo(
    () => filteredUsers.filter((u) => u.email).map((u) => String(u._id)),
    [filteredUsers]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableIds);
    }
  };

  const toggleRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const sendBulk = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Send new login credentials to ${selectedIds.length} selected employee(s)?`)) return;
    setSending(true);
    try {
      const res = await api.post("/users/send-credentials-bulk", { userIds: selectedIds });
      const { sentCount, failedCount, results } = res.data || {};
      setCredsResult(results || []);
      if (failedCount > 0) {
        showToast(`Sent: ${sentCount}, Failed: ${failedCount}. Credentials shown below.`, "warning");
      } else {
        showToast(`Credentials sent to ${sentCount} employee(s). Credentials shown below.`, "success");
      }
      setSelectedIds([]);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSending(false);
    }
  };

  const getRoleNames = (roleIds) =>
    (roleIds || [])
      .map((r) => (typeof r === "object" && r?.name ? r.name : "—"))
      .join(", ") || "—";

  return (
    <ModulePage
      title="Employee Management"
      description="Filter by role, search by name/email/ID, select employees, and send login credentials in bulk."
    >
      <TenantScopeBanner context="Employee Management" />
      {!canSendCreds ? (
        <p
          className="small-note"
          style={{
            padding: "12px",
            background: "var(--danger-bg)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger-text)",
          }}
        >
          You do not have the <code>user.send-credentials</code> or <code>tenant.manage</code> permission. Contact your
          admin to request access.
        </p>
      ) : null}

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "0 0 12px" }}>
        <input
          type="text"
          placeholder="Search by name, email, or emp ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 180, minHeight: 36 }}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ minWidth: 160, minHeight: 36 }}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r._id} value={r._id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 140, minHeight: 36 }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {canSendCreds ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 16px",
            marginBottom: "12px",
            borderRadius: "var(--radius-md)",
            background: selectedIds.length ? "var(--primary-muted)" : "var(--bg-subtle)",
            border: "1px solid var(--border)",
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={!selectableIds.length}
              style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
            />
            Select all ({filteredUsers.length})
          </label>
          <span style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>|</span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {selectedIds.length} selected
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedIds.length || sending}
            onClick={sendBulk}
          >
            {sending ? "Sending..." : `Send Creds (${selectedIds.length})`}
          </button>
        </div>
      ) : null}

      {/* Credentials result */}
      {credsResult && credsResult.length > 0 ? (
        <div
          style={{
            marginBottom: "16px",
            padding: "16px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--success-border, #059669)",
            background: "var(--success-bg, rgba(5,150,105,0.06))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "0.95rem" }}>Generated Credentials</h4>
            <button type="button" className="btn-ghost" onClick={() => setCredsResult(null)} style={{ fontSize: "0.8rem" }}>
              Dismiss
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {credsResult.map((r) => (
              <div
                key={r.userId}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  fontSize: "0.85rem",
                }}
              >
                <strong>{r.name}</strong>
                <span style={{ color: "var(--text-muted)" }}>{r.email}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>ID: {r.empCode}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: "#fef3c7",
                    border: "1px solid #f59e0b",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(r.password);
                    showToast("Password copied!", "success");
                  }}
                  title="Click to copy"
                >
                  {r.password}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontWeight: 600,
                    background: r.success ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)",
                    color: r.success ? "#059669" : "#dc2626",
                  }}
                >
                  {r.success ? "Email sent" : "Email failed"}
                </span>
              </div>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Save these passwords. They will not be shown again.
          </p>
        </div>
      ) : null}

      {/* Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {canSendCreds ? <th style={{ width: 40 }}></th> : null}
              <th>Name</th>
              <th>Email</th>
              <th>Emp ID</th>
              <th>Roles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={canSendCreds ? 6 : 5} className="table-empty">
                  {loading ? "Loading employees..." : "No employees match the current filters."}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const id = String(user._id);
                const checked = selectedIds.includes(id);
                const disabled = !user.email;
                return (
                  <tr
                    key={id}
                    style={{
                      background: checked ? "var(--primary-muted)" : undefined,
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    {canSendCreds ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleRow(id)}
                          style={{ width: 16, height: 16, accentColor: "var(--primary)", cursor: disabled ? "not-allowed" : "pointer" }}
                          title={disabled ? "No email on file — cannot send credentials" : user.name}
                        />
                      </td>
                    ) : null}
                    <td>{user.name}</td>
                    <td>{user.email || "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{user.empCode || "—"}</td>
                    <td>{getRoleNames(user.roleIds)}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background:
                            user.status === "ACTIVE"
                              ? "rgba(5,150,105,0.1)"
                              : user.status === "SUSPENDED"
                              ? "rgba(220,38,38,0.1)"
                              : "rgba(100,116,139,0.12)",
                          color:
                            user.status === "ACTIVE"
                              ? "var(--success)"
                              : user.status === "SUSPENDED"
                              ? "var(--error)"
                              : "var(--text-muted)",
                        }}
                      >
                        {user.status || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ModulePage>
  );
}

export default EmployeeManagementPage;
