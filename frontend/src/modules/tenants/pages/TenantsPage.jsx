import { useEffect, useState } from "react";
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
  const [form, setForm] = useState({ name: "", code: "", email: "", plan: "starter", status: "ACTIVE" });
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", email: "", plan: "starter" });

  const load = async () => {
    try {
      const res = await api.get("/tenants");
      setItems(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createTenant = async (event) => {
    event.preventDefault();
    try {
      await api.post("/tenants", form);
      showToast("Tenant created", "success");
      setForm({ name: "", code: "", email: "", plan: "starter", status: "ACTIVE" });
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const createAndSendCreds = async (event) => {
    event.preventDefault();
    try {
      const res = await api.post("/tenants", form);
      const tenantId = res.data._id;
      await api.post(`/tenants/${tenantId}/send-creds`);
      showToast("Tenant created and credentials sent", "success");
      setForm({ name: "", code: "", email: "", plan: "starter", status: "ACTIVE" });
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const openEdit = (tenant) => {
    setEditForm({ name: tenant.name, code: tenant.code, email: tenant.email || "", plan: tenant.plan });
    setEditModal(tenant);
  };

  const saveEdit = async () => {
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        plan: editForm.plan,
      };
      await api.patch(`/tenants/${editModal._id}`, payload);
      showToast("Tenant updated", "success");
      setEditModal(null);
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const sendCreds = async (tenant) => {
    try {
      const res = await api.post(`/tenants/${tenant._id}/send-creds`);
      showToast(`Credentials sent to ${res.data.email}`, "success");
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

  return (
    <ModulePage title="Tenants" description="Create and manage tenant lifecycle.">
      <form className="inline-form" onSubmit={createTenant}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <input placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
        <input placeholder="Admin Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
        <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={form.plan === "starter"} onChange={(e) => setForm((p) => ({ ...p, plan: e.target.checked ? "starter" : "basic" }))} />
          Starter
        </label>
        <button className="btn-primary" type="submit">Create</button>
        <button className="btn-secondary" type="button" onClick={createAndSendCreds}>Create &amp; Send Creds</button>
      </form>

      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "code", label: "Code" },
          { key: "email", label: "Admin Email" },
          { key: "plan", label: "Plan" },
          { key: "status", label: "Status" },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <span className="table-row-actions">
                <button className="btn-secondary" type="button" onClick={() => openEdit(row)}>Edit</button>
                <button className="btn-secondary" type="button" onClick={() => sendCreds(row)}>Send Creds</button>
                <button className="btn-secondary" type="button" onClick={() => toggleTenantStatus(row)}>
                  {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </button>
                {String(row._id) !== String(user?.tenantId) ? (
                  <button className="btn-secondary" type="button" onClick={() => deleteTenant(row)}>Delete</button>
                ) : null}
              </span>
            ),
          },
        ]}
        rows={items}
      />

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Tenant</h3>
            <div className="modal-form">
              <label>Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              <label>Code</label>
              <input value={editForm.code} disabled style={{ opacity: 0.6 }} />
              <label>Admin Email</label>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
              <label>Plan</label>
              <select value={editForm.plan} onChange={(e) => setEditForm((p) => ({ ...p, plan: e.target.value }))}>
                <option value="starter">Starter</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={saveEdit}>Save</button>
              <button className="btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </ModulePage>
  );
}

export default TenantsPage;
