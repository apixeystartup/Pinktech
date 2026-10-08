import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function EmployeeManagementPage() {
  const { showToast } = useToast();
  const { permissionCodes = [] } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assignRow, setAssignRow] = useState(null);
  const [assigning, setAssigning] = useState(false);

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

  const tenantForEmployee = (row) => {
    const byAdmin = tenants.find((t) => String(t.adminUserId || "") === String(row._id));
    if (byAdmin) return byAdmin;
    return tenants.find(
      (t) => String(t._id) === String(row.tenantId) && t.email && t.email === row.email
    ) || null;
  };

  const tenantForAssign = assignRow
    ? tenants.find((t) => String(t._id) === String(assignRow.tenantId)) || null
    : null;

  const confirmAssign = async () => {
    if (!assignRow || !tenantForAssign) return;
    setAssigning(true);
    try {
      await api.post(`/tenants/${tenantForAssign._id}/assign-account`, { userId: assignRow._id });
      showToast(`Tenant account of ${tenantForAssign.name} assigned to ${assignRow.name}`, "success");
      setAssignRow(null);
      await Promise.all([load(), loadTenants()]);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setAssigning(false);
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
    {
      key: "tenantAccount",
      label: "Tenant Account",
      render: (row) => {
        if (!canAssign) return "—";
        const tenant = tenantForEmployee(row);
        if (!tenant) return "—";
        return (
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: "#0b6b3a",
              background: "#e6f6ee",
              border: "1px solid #b7e4cd",
            }}
          >
            {tenant.name}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span style={{ color: row.status === "ACTIVE" ? "green" : row.status === "INVITED" ? "orange" : "gray" }}>
          {row.status}
        </span>
      ),
    },
    ...(canAssign
      ? [
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <span className="table-row-actions">
                <button className="btn-secondary" type="button" onClick={() => setAssignRow(row)}>
                  Assign Tenant Account
                </button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <ModulePage
      title="Employee Management"
      description="Manage employees, assign tenant accounts, send credentials, and reset passwords."
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn-secondary" onClick={load}>Refresh</button>
        <button className="btn-secondary" onClick={() => sendCreds([...selected])} disabled={selected.size === 0}>
          Send Creds ({selected.size})
        </button>
        <button className="btn-secondary" onClick={() => resetCreds([...selected])} disabled={selected.size === 0}>
          Reset Creds ({selected.size})
        </button>
      </div>

      <DataTable columns={columns} rows={filtered} />

      {assignRow && (
        <div className="modal-overlay" onClick={() => setAssignRow(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Tenant Account</h3>
            <div className="modal-form">
              <label>Employee</label>
              <input value={`${assignRow.name} (${assignRow.email})`} disabled style={{ opacity: 0.6 }} />
              <label>Tenant</label>
              <input
                value={tenantForAssign ? `${tenantForAssign.name} (${tenantForAssign.code})` : "Tenant not found"}
                disabled
                style={{ opacity: 0.6 }}
              />
              <p className="small-note">
                {tenantForAssign
                  ? `${assignRow.name} will become the tenant admin account of ${tenantForAssign.name}. Their email becomes the tenant admin email and tenant credentials will be issued to them.`
                  : "The employee's tenant is not available. Refresh and try again."}
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={confirmAssign}
                disabled={assigning || !tenantForAssign}
              >
                {assigning ? "Assigning..." : "Assign"}
              </button>
              <button className="btn-secondary" onClick={() => setAssignRow(null)} disabled={assigning}>
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
