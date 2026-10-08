import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

const adminBadgeStyle = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  color: "#0b6b3a",
  background: "#e6f6ee",
  border: "1px solid #b7e4cd",
};

const vacantBadgeStyle = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  color: "#8a6d00",
  background: "#fff8e1",
  border: "1px solid #ffe08a",
};

function EmployeeManagementPage() {
  const { showToast } = useToast();
  const { permissionCodes = [] } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assignRow, setAssignRow] = useState(null);
  const [unassignRow, setUnassignRow] = useState(null);
  const [busy, setBusy] = useState(false);

  const canAssign = permissionCodes.includes("*") || permissionCodes.includes("tenant.manage");

  const load = async () => {
    try {
      const res = await api.get("/users?showAll=true");
      setEmployees((res.data || []).filter((e) => e.email !== "superadmin@example.com"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const loadTenants = async () => {
    if (!canAssign) return;
    try {
      const res = await api.get("/tenants");
      setTenants(res.data || []);
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

  const filtered = statusFilter === "ALL"
    ? employees
    : employees.filter((e) => e.status === statusFilter);

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

  const singleSelected = selected.size === 1
    ? employees.find((e) => selected.has(e._id)) || null
    : null;

  const canConfirmAssign =
    canAssign && Boolean(singleSelected) && !adminTenantOfRow(singleSelected) && Boolean(tenantOfRow(singleSelected));
  const canConfirmUnassign = canAssign && Boolean(singleSelected) && Boolean(adminTenantOfRow(singleSelected));

  const reload = async () => {
    await Promise.all([load(), loadTenants()]);
  };

  const confirmAssign = async () => {
    if (!assignRow) return;
    const tenant = tenantOfRow(assignRow);
    if (!tenant) {
      showToast("Employee's tenant is not available", "error");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/tenants/${tenant._id}/assign-account`, { userId: assignRow._id });
      showToast(`${assignRow.name} is now the admin of ${tenant.name}`, "success");
      setAssignRow(null);
      setSelected(new Set());
      await reload();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmUnassign = async () => {
    if (!unassignRow) return;
    const tenant = adminTenantOfRow(unassignRow);
    if (!tenant) {
      showToast("Tenant admin account is not available", "error");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/tenants/${tenant._id}/unassign-account`, { userId: unassignRow._id });
      showToast(`Tenant admin account of ${tenant.name} is now vacant`, "success");
      setUnassignRow(null);
      setSelected(new Set());
      await reload();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
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
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e._id)));
    }
  };

  const sendCreds = async (userIds) => {
    if (!userIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let sent = 0;
      for (const id of userIds) {
        await api.post(`/users/${id}/send-creds`);
        sent++;
      }
      showToast(`Credentials sent to ${sent} employee(s)`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const resetCreds = async (userIds) => {
    if (!userIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let reset = 0;
      for (const id of userIds) {
        await api.post(`/users/${id}/reset-creds`);
        reset++;
      }
      showToast(`Credentials reset for ${reset} employee(s)`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const formatRoles = (roleIds) => {
    if (!roleIds || !roleIds.length) return "—";
    return roleIds.map((r) => r.name || r).join(", ");
  };

  const columns = [
    {
      key: "_select",
      label: (
        <input
          type="checkbox"
          checked={selected.size === filtered.length && filtered.length > 0}
          onChange={toggleSelectAll}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row._id)}
          onChange={() => toggleSelect(row._id)}
        />
      ),
    },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "empCode", label: "Emp ID" },
    { key: "roles", label: "Roles", render: (row) => formatRoles(row.roleIds) },
    ...(canAssign
      ? [
          {
            key: "tenantAdmin",
            label: "Tenant Admin",
            render: (row) => {
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
              return "—";
            },
          },
        ]
      : []),
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span style={{ color: row.status === "ACTIVE" ? "green" : row.status === "INVITED" ? "orange" : "gray" }}>
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <ModulePage
      title="Employee Management"
      description="Manage employees, assign tenant admin accounts, send credentials, and reset passwords."
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["ALL", "ACTIVE", "INVITED", "DISABLED"].map((s) => (
          <button
            key={s}
            className={statusFilter === s ? "btn-primary" : "btn-secondary"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={load}>Refresh</button>
        <button className="btn-secondary" onClick={() => sendCreds([...selected])} disabled={selected.size === 0}>
          Send Creds ({selected.size})
        </button>
        <button className="btn-secondary" onClick={() => resetCreds([...selected])} disabled={selected.size === 0}>
          Reset Creds ({selected.size})
        </button>
        {canAssign && (
          <>
            <button
              className="btn-primary"
              onClick={() => setAssignRow(singleSelected)}
              disabled={!canConfirmAssign}
              title="Select exactly one employee to make them the tenant admin"
            >
              Assign Admin
            </button>
            <button
              className="btn-secondary"
              onClick={() => setUnassignRow(singleSelected)}
              disabled={!canConfirmUnassign}
              title="Select the employee holding the admin account to make it vacant"
            >
              Unassign
            </button>
          </>
        )}
      </div>

      <DataTable columns={columns} rows={filtered} />

      {assignRow && (
        <div className="modal-overlay" onClick={() => setAssignRow(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Admin Account</h3>
            <div className="modal-form">
              <label>Employee</label>
              <input value={`${assignRow.name} (${assignRow.email})`} disabled style={{ opacity: 0.6 }} />
              <label>Tenant</label>
              <input
                value={
                  tenantOfRow(assignRow)
                    ? `${tenantOfRow(assignRow).name} (${tenantOfRow(assignRow).code})`
                    : "Tenant not found"
                }
                disabled
                style={{ opacity: 0.6 }}
              />
              <p className="small-note">
                Credentials will be emailed to the employee first, then the tenant admin
                email will be updated to theirs and the row will be marked Admin.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={confirmAssign} disabled={busy}>
                {busy ? "Assigning..." : "Assign"}
              </button>
              <button className="btn-secondary" onClick={() => setAssignRow(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {unassignRow && (
        <div className="modal-overlay" onClick={() => setUnassignRow(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Unassign Admin Account</h3>
            <div className="modal-form">
              <label>Employee</label>
              <input value={`${unassignRow.name} (${unassignRow.email})`} disabled style={{ opacity: 0.6 }} />
              <label>Tenant</label>
              <input
                value={
                  adminTenantOfRow(unassignRow)
                    ? `${adminTenantOfRow(unassignRow).name} (${adminTenantOfRow(unassignRow).code})`
                    : "Tenant not found"
                }
                disabled
                style={{ opacity: 0.6 }}
              />
              <p className="small-note">
                The tenant admin account becomes vacant. The employee keeps their own
                login and credentials.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={confirmUnassign} disabled={busy}>
                {busy ? "Unassigning..." : "Unassign"}
              </button>
              <button className="btn-secondary" onClick={() => setUnassignRow(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ModulePage>
  );
}

export default EmployeeManagementPage;
