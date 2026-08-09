import { useEffect, useCallback, useState } from "react";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function TenantsPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", code: "", adminEmail: "", plan: "starter", status: "ACTIVE" });
  const [editingTenant, setEditingTenant] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", adminEmail: "", plan: "", status: "" });
  const [sendingCredsId, setSendingCredsId] = useState(null);
  const [lastCreds, setLastCreds] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/tenants");
      setItems(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    api.get("/tenants").then((res) => {
      if (active) setItems(res.data || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const createTenant = async (event) => {
    event.preventDefault();
    try {
      const res = await api.post("/tenants", form);
      const creds = res.data?.credentials;
      if (creds) {
        setLastCreds(creds);
        const msg = creds.emailSent
          ? `Tenant created. Credentials sent to ${creds.email}.`
          : `Tenant created. Email failed — credentials shown below.`;
        showToast(msg, creds.emailSent ? "success" : "warning");
      } else {
        showToast("Tenant created", "success");
      }
      setForm({ name: "", code: "", adminEmail: "", plan: "starter", status: "ACTIVE" });
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const deleteTenant = async (tenant) => {
    if (!window.confirm(`Delete tenant "${tenant.name}"? This action is permanent.`)) {
      return;
    }
    try {
      await api.delete(`/tenants/${tenant._id}`);
      showToast("Tenant deleted", "success");
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const toggleTenantStatus = async (tenant) => {
    try {
      const nextStatus = tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await api.patch(`/tenants/${tenant._id}`, { status: nextStatus });
      showToast(`Tenant marked ${nextStatus}`, "success");
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const openEditModal = (tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name || "",
      adminEmail: tenant.adminEmail || "",
      plan: tenant.plan || "",
      status: tenant.status || "ACTIVE",
    });
  };

  const closeEditModal = () => {
    setEditingTenant(null);
    setEditForm({ name: "", adminEmail: "", plan: "", status: "" });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingTenant) return;
    try {
      await api.patch(`/tenants/${editingTenant._id}`, editForm);
      showToast("Tenant updated", "success");
      closeEditModal();
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const sendCredentials = async (tenant) => {
    const email = tenant.adminEmail || editForm.adminEmail;
    if (!email) {
      showToast("No admin email set. Edit the tenant to add one first.", "error");
      return;
    }
    if (!window.confirm(`Send login credentials to ${email} for "${tenant.name}"?`)) return;
    setSendingCredsId(tenant._id);
    try {
      const res = await api.post(`/tenants/${tenant._id}/send-credentials`);
      const creds = res.data;
      if (creds?.password) {
        setLastCreds({ email: creds.email, empCode: creds.empCode, password: creds.password, emailSent: creds.emailSent, emailError: creds.emailError });
        const msg = creds.emailSent
          ? `Credentials sent to ${email}.`
          : `Email failed — credentials shown below.`;
        showToast(msg, creds.emailSent ? "success" : "warning");
      } else {
        showToast(`Credentials sent to ${email}`, "success");
      }
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSendingCredsId(null);
    }
  };

  return (
    <ModulePage title="Tenants" description="Create and manage tenant lifecycle. When a tenant is created, admin credentials are auto-generated and sent to the admin email.">
      <form className="inline-form" onSubmit={createTenant}>
        <input
          placeholder="Tenant name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          placeholder="Code (e.g. ACME)"
          value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          required
        />
        <input
          type="email"
          placeholder="Admin email"
          value={form.adminEmail}
          onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
          required
        />
        <input
          placeholder="Plan"
          value={form.plan}
          onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value }))}
        />
        <button className="btn-primary" type="submit">
          Create &amp; Send Creds
        </button>
      </form>

      {lastCreds ? (
        <div
          style={{
            margin: "16px 0",
            padding: "16px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid #059669",
            background: "rgba(5,150,105,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "0.95rem" }}>Admin Credentials</h4>
            <button type="button" className="btn-ghost" onClick={() => setLastCreds(null)} style={{ fontSize: "0.8rem" }}>
              Dismiss
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "center",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>{lastCreds.email}</span>
            {lastCreds.empCode ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>ID: {lastCreds.empCode}</span> : null}
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
                navigator.clipboard.writeText(lastCreds.password);
                showToast("Password copied!", "success");
              }}
              title="Click to copy"
            >
              {lastCreds.password}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "999px",
                fontWeight: 600,
                background: lastCreds.emailSent ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)",
                color: lastCreds.emailSent ? "#059669" : "#dc2626",
              }}
            >
              {lastCreds.emailSent ? "Email sent" : "Email failed"}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Save this password. It will not be shown again.
          </p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "code", label: "Code" },
          { key: "adminEmail", label: "Admin Email", render: (row) => row.adminEmail || <span style={{ color: "var(--text-faint)" }}>—</span> },
          { key: "plan", label: "Plan" },
          {
            key: "status",
            label: "Status",
            render: (row) => (
              <span className={`workflow-status-pill ${row.status === "ACTIVE" ? "workflow-status-pill--ok" : "workflow-status-pill--bad"}`}>
                {row.status}
              </span>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <span className="table-row-actions">
                <button className="btn-secondary" type="button" onClick={() => openEditModal(row)}>
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={sendingCredsId === row._id}
                  onClick={() => sendCredentials(row)}
                >
                  {sendingCredsId === row._id ? "Sending..." : "Send Creds"}
                </button>
                <button className="btn-secondary" type="button" onClick={() => toggleTenantStatus(row)}>
                  {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
                {String(row._id) !== String(user?.tenantId) ? (
                  <button className="btn-danger" type="button" onClick={() => deleteTenant(row)}>
                    Delete
                  </button>
                ) : null}
              </span>
            ),
          },
        ]}
        rows={items}
      />

      {editingTenant ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEditModal}>
          <div
            className="modal-card invite-modal-card"
            role="dialog"
            aria-labelledby="edit-tenant-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-tenant-title">Edit Tenant</h3>
            <p className="small-note" style={{ marginTop: 0 }}>
              Update <strong>{editingTenant.name}</strong> details. Use "Send Creds" to email new login credentials.
            </p>
            <form className="stacked-form" onSubmit={saveEdit}>
              <label className="stacked-label">
                Tenant Name
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </label>
              <label className="stacked-label">
                Admin Email
                <input
                  type="email"
                  value={editForm.adminEmail}
                  onChange={(e) => setEditForm((p) => ({ ...p, adminEmail: e.target.value }))}
                  placeholder="admin@example.com"
                />
              </label>
              <label className="stacked-label">
                Plan
                <input
                  value={editForm.plan}
                  onChange={(e) => setEditForm((p) => ({ ...p, plan: e.target.value }))}
                />
              </label>
              <label className="stacked-label">
                Status
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </label>
              <div className="inline-form" style={{ marginTop: "0.5rem", justifyContent: "flex-end" }}>
                <button className="btn-secondary" type="button" onClick={closeEditModal}>
                  Cancel
                </button>
                <button className="btn-primary" type="submit">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </ModulePage>
  );
}

export default TenantsPage;
