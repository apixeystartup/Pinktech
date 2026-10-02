import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import useAuth from "../../../hooks/useAuth";

function formatCollected(row) {
  const c = row.collectedDetails || {};
  const parts = [];
  if (c.AADHAAR) {
    const a = c.AADHAAR;
    const mask = a.aadhaarNumber ? `····${String(a.aadhaarNumber).slice(-4)}` : `····${a.lastFourDigits || ""}`;
    const extra = [a.mobile, a.email].filter(Boolean).join(" · ");
    parts.push(`Aadhaar: ${a.fullName || "—"} (${mask})${extra ? ` · ${extra}` : ""}`);
  }
  if (c.PAN) {
    parts.push(c.PAN.fullName ? `PAN: ${c.PAN.fullName} (${c.PAN.panNumber || "—"})` : `PAN: ${c.PAN.panNumber || "—"}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 20,
  marginBottom: 20,
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#374151",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};

const rowStyle = {
  display: "flex",
  gap: 12,
  marginBottom: 12,
};

function KycPage() {
  const { showToast } = useToast();
  const { tenantContextId } = useAuth();
  const [externalUsers, setExternalUsers] = useState([]);
  const [detailPanel, setDetailPanel] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [newExternalUser, setNewExternalUser] = useState({ type: "CUSTOMER", name: "", email: "", phone: "" });
  const [initForm, setInitForm] = useState({
    refType: "EXTERNAL_USER",
    refId: "",
    otpType: "AADHAAR",
  });
  const [deletingId, setDeletingId] = useState(null);
  const pollerRef = useRef(null);

  const loadExternalUsers = useCallback(async () => {
    try {
      const res = await api.get("/kyc/external-users");
      const rows = res.data || [];
      setExternalUsers(rows);
      setInitForm((prev) => (prev.refId || rows.length === 0 ? prev : { ...prev, refId: String(rows[0]._id) }));
      setDetailPanel((prev) => {
        if (!prev?._id) return prev;
        const updated = rows.find((r) => String(r._id) === String(prev._id));
        return updated || null;
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    api
      .get("/kyc/external-users")
      .then((res) => {
        if (!active) return;
        const rows = res.data || [];
        setExternalUsers(rows);
        setInitForm((prev) => (prev.refId || rows.length === 0 ? prev : { ...prev, refId: String(rows[0]._id) }));
      })
      .catch((error) => {
        if (active) showToast(getErrorMessage(error), "error");
      });
    return () => {
      active = false;
    };
  }, [showToast, tenantContextId]);

  useEffect(() => {
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    pollerRef.current = setInterval(() => {
      loadExternalUsers();
    }, 3000);
    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    };
  }, [tenantContextId, loadExternalUsers]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setDetailPanel(null);
    }
    if (detailPanel) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailPanel]);

  const createExternalUser = async (event) => {
    event.preventDefault();
    try {
      await api.post("/kyc/external-users", newExternalUser);
      setNewExternalUser({ type: "CUSTOMER", name: "", email: "", phone: "" });
      showToast("External user created and notified via email", "success");
      loadExternalUsers();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const initiate = async (event) => {
    event.preventDefault();
    try {
      const verifyBaseUrl = `${window.location.origin}/public/kyc-verify`;
      const res = await api.post("/kyc/initiate", { ...initForm, verifyBaseUrl });
      showToast(`KYC initiated: ${res.data.kycId} — OTP email sent`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const openDetailPanel = (row) => {
    setDetailPanel(row);
    setEditForm({
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
    });
  };

  const closeDetailPanel = () => {
    setDetailPanel(null);
    setEditForm({ name: "", email: "", phone: "" });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!detailPanel) return;
    try {
      await api.patch(`/kyc/external-users/${detailPanel._id}`, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || null,
      });
      showToast("External user updated", "success");
      closeDetailPanel();
      loadExternalUsers();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const deleteExternalUser = async (id) => {
    if (!window.confirm("Delete this external user and their KYC data? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await api.delete(`/kyc/external-users/${id}`);
      showToast("External user deleted", "success");
      if (detailPanel && String(detailPanel._id) === String(id)) closeDetailPanel();
      setInitForm((prev) => (String(prev.refId) === String(id) ? { ...prev, refId: "" } : prev));
      loadExternalUsers();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ModulePage
      title="KYC"
      description="Create external users and send Aadhaar or PAN OTP links. They enter document details on the public verification page after opening the email link."
    >
      <TenantScopeBanner context="KYC" />

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>Create External User</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>Add a customer or vendor who needs KYC verification.</p>
        <form onSubmit={createExternalUser}>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select
                style={inputStyle}
                value={newExternalUser.type}
                onChange={(e) => setNewExternalUser((p) => ({ ...p, type: e.target.value }))}
                required
              >
                <option value="CUSTOMER">Customer</option>
                <option value="VENDOR">Vendor</option>
                <option value="PARTNER">Partner</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                placeholder="Full name"
                value={newExternalUser.name}
                onChange={(e) => setNewExternalUser((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                placeholder="user@example.com"
                value={newExternalUser.email}
                onChange={(e) => setNewExternalUser((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Phone (optional)</label>
              <input
                style={inputStyle}
                placeholder="+91 98765 43210"
                value={newExternalUser.phone}
                onChange={(e) => setNewExternalUser((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" style={{ marginTop: 4 }}>
            Create External User
          </button>
        </form>
      </div>

      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "type", label: "Type" },
          { key: "aadhaarStatus", label: "Aadhaar" },
          { key: "panStatus", label: "PAN" },
          {
            key: "collected",
            label: "Verified details",
            render: (row) => <span className="small-note">{formatCollected(row)}</span>,
          },
          { key: "kycStatus", label: "KYC Status" },
          { key: "createdByLabel", label: "Created By" },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <span className="table-row-actions">
                <button type="button" className="btn-secondary" onClick={() => openDetailPanel(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={deletingId === row._id}
                  onClick={() => deleteExternalUser(row._id)}
                >
                  {deletingId === row._id ? "Deleting…" : "Delete"}
                </button>
              </span>
            ),
          },
        ]}
        rows={externalUsers}
      />

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>Send OTP Link</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>Select a user and send them an Aadhaar or PAN verification link via email.</p>
        <form onSubmit={initiate}>
          <div style={rowStyle}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>External User</label>
              <select
                style={inputStyle}
                value={initForm.refId}
                onChange={(e) => setInitForm((p) => ({ ...p, refId: e.target.value }))}
                required
              >
                <option value="">Select external user</option>
                {externalUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Verification Type</label>
              <select
                style={inputStyle}
                value={initForm.otpType}
                onChange={(e) => setInitForm((p) => ({ ...p, otpType: e.target.value }))}
                required
              >
                <option value="AADHAAR">Aadhaar OTP</option>
                <option value="PAN">PAN OTP</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" type="submit" style={{ marginTop: 4 }}>
            Send OTP Link
          </button>
        </form>
      </div>

      {detailPanel ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDetailPanel}>
          <aside className="modal-card invite-modal-card" role="dialog" aria-labelledby="kyc-detail-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="kyc-detail-title">External user details</h3>
            <p className="small-note">Review KYC state and update contact fields.</p>

            <dl className="kyc-detail-dl">
              <dt>Type</dt>
              <dd>{detailPanel.type || "—"}</dd>
              <dt>KYC record</dt>
              <dd>
                <code className="small-note">{detailPanel.kycId || "—"}</code>
              </dd>
              <dt>Aadhaar</dt>
              <dd>{detailPanel.aadhaarStatus || "—"}</dd>
              <dt>PAN</dt>
              <dd>{detailPanel.panStatus || "—"}</dd>
              <dt>Overall</dt>
              <dd>{detailPanel.kycStatus || "—"}</dd>
              <dt>Verified details</dt>
              <dd className="small-note">{formatCollected(detailPanel)}</dd>
              <dt>Created by</dt>
              <dd>{detailPanel.createdByLabel || "—"}</dd>
            </dl>

            <h4 className="kyc-detail-edit-heading">Edit contact</h4>
            <form className="stacked-form" onSubmit={saveEdit}>
              <label className="stacked-label">
                Name
                <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label className="stacked-label">
                Email
                <input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} required />
              </label>
              <label className="stacked-label">
                Phone
                <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
              </label>
              <div className="inline-form" style={{ marginTop: "0.5rem" }}>
                <button className="btn-primary" type="submit">
                  Save changes
                </button>
                <button className="btn-secondary" type="button" onClick={closeDetailPanel}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={deletingId === detailPanel._id}
                  onClick={() => deleteExternalUser(detailPanel._id)}
                >
                  {deletingId === detailPanel._id ? "Deleting…" : "Delete user"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </ModulePage>
  );
}

export default KycPage;
