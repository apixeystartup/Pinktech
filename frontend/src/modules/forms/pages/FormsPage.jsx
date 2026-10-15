import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ModulePage from "../../../components/common/ModulePage";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";
import useAuth from "../../../hooks/useAuth";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import "../../../styles/schema-forms.css";

const EMPTY_ORG = { name: "", code: "", email: "", phone: "", address: "", registrationNumber: "" };

function FormsPage() {
  const { tenantContextId, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState("builder");
  const [org, setOrg] = useState(EMPTY_ORG);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgNote, setOrgNote] = useState("");
  const [showOrgEdit, setShowOrgEdit] = useState(false);

  // Org (Party 1) data feeds the Templates header box + the template preview.
  // Reload on every tenant switch — super admin designs per tenant via the
  // header override.
  const tenantKey = String(tenantContextId || "");
  const loadedFor = useRef("");
  useEffect(() => {
    if (loadedFor.current === tenantKey) return;
    loadedFor.current = tenantKey;
    let active = true;
    setOrgLoading(true);
    setOrgNote("");
    api
      .get("/tenants/current")
      .then((res) => {
        if (!active) return;
        const t = res.data || {};
        setOrg({
          name: t.name || "",
          code: t.code || "",
          email: t.email || "",
          phone: t.phone || "",
          address: t.address || "",
          registrationNumber: t.registrationNumber || t.registration_number || "",
        });
        setOrgLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setOrgNote(getErrorMessage(err));
        setOrgLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenantKey]);

  const saveOrg = async (event) => {
    event.preventDefault();
    setOrgSaving(true);
    setOrgNote("");
    try {
      const res = await api.patch("/tenants/current", {
        email: String(org.email || "").trim(),
        phone: String(org.phone || "").trim(),
        address: String(org.address || "").trim(),
        registrationNumber: String(org.registrationNumber || "").trim(),
      });
      const t = res.data || {};
      setOrg((prev) => ({
        ...prev,
        email: t.email || "",
        phone: t.phone || "",
        address: t.address || "",
        registrationNumber: t.registrationNumber || t.registration_number || "",
      }));
      setShowOrgEdit(false);
    } catch (err) {
      setOrgNote(getErrorMessage(err));
    } finally {
      setOrgSaving(false);
    }
  };

  const needsTenant = Boolean(isSuperAdmin && !tenantContextId);

  const orgSummary = (
    <span className="org-summary">
      {needsTenant ? (
        <span className="org-summary__data">Pick a tenant in the top bar.</span>
      ) : orgLoading ? (
        <span className="org-summary__data">Loading…</span>
      ) : (
        <span className="org-summary__data org-summary__data--stacked">
          <span className="org-summary__row">
            <strong>{org.name || "—"}</strong>
            {org.code ? <span className="org-summary__code">{org.code}</span> : null}
          </span>
          <span className="org-summary__row">
            {org.email ? <span>{org.email}</span> : null}
            {org.phone ? <span>{org.phone}</span> : null}
          </span>
        </span>
      )}
      {needsTenant ? null : (
        <button
          type="button"
          className="org-summary__edit"
          aria-label="Edit organization data"
          title="Edit organization data"
          onClick={() => {
            setOrgNote("");
            setShowOrgEdit(true);
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
      {orgNote && !showOrgEdit ? <span className="org-summary__note">{orgNote}</span> : null}
    </span>
  );

  return (
    <ModulePage
      title={tab === "builder" ? "Forms" : orgSummary}
      description={
        tab === "builder"
          ? "Schema-driven forms (pink-form): design questions, share the public link, and review submissions with PDF receipts."
          : null
      }
      actions={
        <div className="segmented-toggle" role="tablist" aria-label="Forms view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "builder"}
            className={`segmented-toggle-btn${tab === "builder" ? " active" : ""}`}
            onClick={() => setTab("builder")}
          >
            Builder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "templates"}
            className={`segmented-toggle-btn${tab === "templates" ? " active" : ""}`}
            onClick={() => setTab("templates")}
          >
            Templates
          </button>
        </div>
      }
    >
      {tab === "builder" ? <SchemaFormsBuilder /> : <TemplatesTab org={org} />}
      {showOrgEdit
        ? createPortal(
          <div className="form-editor-backdrop" onClick={() => setShowOrgEdit(false)}>
            <div className="form-editor-modal schema-forms" onClick={(e) => e.stopPropagation()}>
              <div className="builderCard">
                <div className="adminRow">
                  <h2>Edit organization data</h2>
                  <button type="button" className="ghostBtn" onClick={() => setShowOrgEdit(false)}>
                    Close
                  </button>
                </div>
                <form onSubmit={saveOrg}>
                  <div className="grid">
                    <div className="field">
                      <label>Organization name</label>
                      <input value={org.name} disabled />
                    </div>
                    <div className="field">
                      <label>Organization code</label>
                      <input value={org.code} disabled />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={org.email}
                        onChange={(e) => setOrg((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input value={org.phone} onChange={(e) => setOrg((p) => ({ ...p, phone: e.target.value }))} />
                    </div>
                  </div>
                  <label>Address</label>
                  <textarea rows={2} value={org.address} onChange={(e) => setOrg((p) => ({ ...p, address: e.target.value }))} />
                  <label>Registration no.</label>
                  <input
                    value={org.registrationNumber}
                    onChange={(e) => setOrg((p) => ({ ...p, registrationNumber: e.target.value }))}
                  />
                  <div className="adminRow" style={{ marginTop: 10 }}>
                    <button type="submit" className="btn-primary" disabled={orgSaving}>
                      {orgSaving ? "Saving…" : "Save organization data"}
                    </button>
                    {orgNote ? <span className="doc-form-note" style={{ margin: 0 }}>{orgNote}</span> : null}
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </ModulePage>
  );
}

export default FormsPage;
