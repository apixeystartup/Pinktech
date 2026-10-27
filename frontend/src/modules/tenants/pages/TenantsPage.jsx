import { useEffect, useMemo, useState } from "react";
import "../../../styles/wf-tenants.css";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

// Pinktech's own tenant powers super-admin access for every workspace, so it
// must never be suspended or deleted. Older databases use code "PLATFORM" for
// the same tenant; both are recognised as the platform.
const isPlatformTenant = (tenant) =>
  ["PINKTECH", "PLATFORM"].includes(String(tenant?.code || "").trim().toUpperCase());

const planLabel = (plan) => {
  const value = String(plan || "starter");
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const statusLabel = (status) => {
  const value = String(status || "ACTIVE");
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

function TenantsPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", code: "", email: "", plan: "starter", status: "ACTIVE" });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    email: "",
    plan: "starter",
    address: "",
    phone: "",
    registrationNumber: "",
  });

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

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((row) =>
      [row.name, row.code, row.email, row.plan, row.status].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [items, searchQuery]);

  const runSearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchInput);
  };

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

  const openEdit = (tenant) => {
    setEditForm({
      name: tenant.name,
      code: tenant.code,
      email: tenant.email || "",
      plan: tenant.plan,
      address: tenant.address || "",
      phone: tenant.phone || "",
      registrationNumber: tenant.registrationNumber || "",
    });
    setEditModal(tenant);
  };

  const saveEdit = async () => {
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        plan: editForm.plan,
        address: editForm.address,
        phone: editForm.phone,
        registrationNumber: editForm.registrationNumber,
      };
      await api.patch(`/tenants/${editModal._id}`, payload);
      showToast("Tenant updated", "success");
      setEditModal(null);
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const [sendingCredsId, setSendingCredsId] = useState(null);
  const [activatingAdminId, setActivatingAdminId] = useState(null);

  const sendCreds = async (tenant) => {
    // One click = one password. Without the guard, double clicks issued two
    // passwords seconds apart and only the second worked, while the first
    // email looked identical — the classic "correct password rejected" report.
    if (sendingCredsId) return;
    setSendingCredsId(tenant._id);
    try {
      const res = await api.post(`/tenants/${tenant._id}/send-creds`);
      showToast(`Credentials sent to ${res.data.email}`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setSendingCredsId(null);
    }
  };

  const activateAdmin = async (tenant) => {
    if (activatingAdminId) return;
    setActivatingAdminId(String(tenant._id));
    try {
      await api.post(`/tenants/${tenant._id}/admin/unlock`);
      showToast("Tenant administrator account activated.", "success");
      await load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setActivatingAdminId(null);
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

  // Shared by the table row and the mobile card so both stay in sync.
  const statusAction = (tenant) =>
    isPlatformTenant(tenant) ? (
      <button
        className="btn-secondary"
        type="button"
        disabled
        title="The platform tenant powers super-admin access for every workspace and cannot be suspended"
      >
        Always Active
      </button>
    ) : (
      <button className="btn-secondary" type="button" onClick={() => toggleTenantStatus(tenant)}>
        {tenant.status === "ACTIVE" ? "Deactivate" : "Activate"}
      </button>
    );

  const deleteAction = (tenant) =>
    String(tenant._id) !== String(user?.tenantId) && !isPlatformTenant(tenant) ? (
      <button className="btn-danger" type="button" onClick={() => deleteTenant(tenant)}>
        Delete
      </button>
    ) : null;

  const sendCredsAction = (tenant) => (
    <button
      className="btn-secondary"
      type="button"
      onClick={() => sendCreds(tenant)}
      disabled={sendingCredsId === tenant._id}
    >
      {sendingCredsId === tenant._id ? "Sending…" : "Send creds"}
    </button>
  );

  const adminAccess = (tenant) =>
    tenant.adminAccountStatus === "LOCKED" ? (
      <span className="tenant-admin-access">
      <span className="tenant-pill tenant-pill--status">
        Temporarily deactivated
        {tenant.adminLockUntil ? ` · until ${new Date(tenant.adminLockUntil).toLocaleString()}` : ""}
      </span>
        <button
          className="btn-secondary"
          type="button"
          disabled={activatingAdminId === String(tenant._id)}
          onClick={() => activateAdmin(tenant)}
        >
          {activatingAdminId === String(tenant._id) ? "Activating…" : "Activate admin"}
        </button>
      </span>
    ) : (
      <span className="tenant-admin-access">
        <span className="tenant-pill tenant-pill--status">
          {tenant.adminAccountStatus ? statusLabel(tenant.adminAccountStatus) : "No admin account"}
        </span>
      </span>
    );

  return (
    <ModulePage title="Tenants" description="Create and manage tenant lifecycle.">
      <div className="tenants-page">
        <form className="tenants-create-form" onSubmit={createTenant}>
          <label className="tenants-field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <label className="tenants-field">
            <span>Code</span>
            <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
          </label>
          <label className="tenants-field">
            <span>Admin email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </label>
          <label className="tenants-field tenants-field--plan">
            <span>Plan</span>
            <select value={form.plan} onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value }))}>
              <option value="starter">Starter</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <div className="tenants-create-actions">
            <button className="btn-primary" type="submit">
              Create tenant
            </button>
          </div>
        </form>

        <form className="tenants-search" onSubmit={runSearch} role="search">
          <label className="tenants-field tenants-search-field">
            <span className="tenants-search-label">Search</span>
            <input
              type="text"
              placeholder="Search tenants"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          {searchInput ? (
            <button
              className="btn-secondary tenants-search-clear"
              type="button"
              aria-label="Clear tenant search"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
              }}
            >
              ×
            </button>
          ) : null}
          <button className="btn-secondary tenants-search-btn" type="submit">
            Search
          </button>
        </form>

        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "code", label: "Code" },
            { key: "email", label: "Admin email" },
            {
              key: "plan",
              label: "Plan",
              render: (row) => planLabel(row.plan),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => statusLabel(row.status),
            },
            {
              key: "adminAccountStatus",
              label: "Admin access",
              render: adminAccess,
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <span className="table-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  {sendCredsAction(row)}
                  {statusAction(row)}
                  {deleteAction(row)}
                </span>
              ),
            },
          ]}
          rows={filteredItems}
          emptyText={searchQuery ? "No tenants match your search." : "No tenants found."}
        />

        <div className="tenants-cards">
          {filteredItems.length === 0 ? (
            <p className="tenants-cards-empty">
              {searchQuery ? "No tenants match your search." : "No tenants found."}
            </p>
          ) : (
            filteredItems.map((row) => (
              <article className="tenant-card" key={row._id || row.id}>
                <div className="tenant-card-top">
                  <div className="tenant-card-id">
                    <span className="tenant-card-name">{row.name}</span>
                    <span className="tenant-card-code">{row.code}</span>
                    <span className="tenant-card-email">{row.email || "—"}</span>
                  </div>
                  <div className="tenant-card-pills">
                    <span className="tenant-pill tenant-pill--plan">{planLabel(row.plan)}</span>
                    <span className="tenant-pill tenant-pill--status">{statusLabel(row.status)}</span>
                  </div>
                </div>
                <div className="tenant-card-admin-access">
                  <span className="tenants-search-label">Admin access</span>
                  {adminAccess(row)}
                </div>
                <div className="tenant-card-actions">
                  <button className="btn-secondary" type="button" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  {sendCredsAction(row)}
                  {statusAction(row)}
                  {deleteAction(row)}
                </div>
              </article>
            ))
          )}
        </div>

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
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                />
                <label>Address (agreement header)</label>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Registered office address"
                />
                <label>Phone (agreement header)</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 …"
                />
                <label>Registration no. (agreement header)</label>
                <input
                  value={editForm.registrationNumber}
                  onChange={(e) => setEditForm((p) => ({ ...p, registrationNumber: e.target.value }))}
                  placeholder="CIN / registration number"
                />
                <label>Plan</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm((p) => ({ ...p, plan: e.target.value }))}
                >
                  <option value="starter">Starter</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-primary" onClick={saveEdit}>
                  Save
                </button>
                <button className="btn-secondary" onClick={() => setEditModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModulePage>
  );
}

export default TenantsPage;
