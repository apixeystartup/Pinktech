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
      showToast("External user created", "success");
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
      showToast(`KYC initiated: ${res.data.kycId}`, "success");
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
      <h3>1) Create External User</h3>
      <form className="inline-form" onSubmit={createExternalUser}>
        <input
          placeholder="Type (e.g. CUSTOMER)"
          value={newExternalUser.type}
          onChange={(e) => setNewExternalUser((p) => ({ ...p, type: e.target.value }))}
          required
        />
        <input
          placeholder="Name"
          value={newExternalUser.name}
          onChange={(e) => setNewExternalUser((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={newExternalUser.email}
          onChange={(e) => setNewExternalUser((p) => ({ ...p, email: e.target.value }))}
          required
        />
        <input
          placeholder="Phone (optional)"
          value={newExternalUser.phone}
          onChange={(e) => setNewExternalUser((p) => ({ ...p, phone: e.target.value }))}
        />
        <button className="btn-primary" type="submit">
          Create External User
        </button>
      </form>

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
          { key: "createdByLabel", label: "Created By (Employee)" },
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

      <h3>2) Send OTP Link</h3>
      <form className="inline-form" onSubmit={initiate}>
        <select value={initForm.refId} onChange={(e) => setInitForm((p) => ({ ...p, refId: e.target.value }))} required>
          <option value="">Select external user</option>
          {externalUsers.map((user) => (
            <option key={user._id} value={user._id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <select value={initForm.otpType} onChange={(e) => setInitForm((p) => ({ ...p, otpType: e.target.value }))} required>
          <option value="AADHAAR">AADHAAR OTP</option>
          <option value="PAN">PAN OTP</option>
        </select>
        <button className="btn-primary" type="submit">
          Send OTP Link
        </button>
      </form>
      <p className="small-note">The person receives OTP, invitation code, and link; they submit name, document number, and (for Aadhaar) mobile and email on that page.</p>

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
