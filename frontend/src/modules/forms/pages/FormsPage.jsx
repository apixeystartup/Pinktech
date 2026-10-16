import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ModulePage from "../../../components/common/ModulePage";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";
import { fetchTemplates, templatesKey } from "../templatesQuery";
import SignaturePad from "../../../components/schema-forms/SignaturePad";
import useAuth from "../../../hooks/useAuth";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import "../../../styles/schema-forms.css";

const EMPTY_ORG = { name: "", code: "", email: "", phone: "", address: "", registrationNumber: "", signature: "", stamp: "" };

/** /tenants/current payload → the editable Party 1 org shape. */
function tenantToOrg(t) {
  return {
    name: t.name || "",
    code: t.code || "",
    email: t.email || "",
    phone: t.phone || "",
    address: t.address || "",
    registrationNumber: t.registrationNumber || t.registration_number || "",
    signature: t.signature || "",
    stamp: t.stamp || "",
  };
}

// Cap uploads at ~1.2M chars of base64 so the PATCH stays under the gateway's
// 2mb JSON limit (mirrors the Joi max on the platform service).
const MAX_SIG_CHARS = 1200000;

/**
 * Uploaded signature image → downscaled PNG data URL (max 900px wide) so a
 * phone photo doesn't blow past the body limit.
 */
function fileToSignatureDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image. Try a PNG or JPG."));
      img.onload = () => {
        const maxW = 900;
        const width = Math.min(img.width || maxW, maxW);
        const height = Math.max(1, Math.round((img.height || 1) * (width / (img.width || 1))));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length > MAX_SIG_CHARS) {
          reject(new Error("That image is too large even after resizing — use a smaller image."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function FormsPage() {
  const { tenantContextId, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState("builder");
  const [org, setOrg] = useState(EMPTY_ORG);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgNote, setOrgNote] = useState("");
  const [showOrgEdit, setShowOrgEdit] = useState(false);
  // "upload" (file picker) or "draw" (canvas pad) — how the Party 1 signature
  // is captured in the org edit popup.
  const [sigMode, setSigMode] = useState("upload");

  const queryClient = useQueryClient();
  // Org (Party 1) data feeds the Templates header box + the template preview.
  // Cached per tenant, so remounts and tab switches render the header from
  // cache immediately while a background revalidation keeps it fresh — no more
  // waiting on (or refreshing for) /tenants/current.
  const tenantKey = String(tenantContextId || "");
  const orgQuery = useQuery({
    queryKey: ["tenant-current", tenantKey],
    queryFn: async () => (await api.get("/tenants/current")).data || null,
    staleTime: 60000,
  });
  const orgLoading = orgQuery.isPending;
  const orgFetchError = orgQuery.isError ? getErrorMessage(orgQuery.error) : "";

  // Warm the Templates list while this page is open so the tab opens instantly.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: templatesKey(tenantKey),
      queryFn: fetchTemplates,
      staleTime: 60000,
    });
  }, [queryClient, tenantKey]);

  // Seed the editable copy once per tenant, and never while the popup is open —
  // a background refresher must not wipe what the admin is typing.
  const seededFor = useRef("");
  useEffect(() => {
    const t = orgQuery.data;
    if (!t || showOrgEdit || seededFor.current === tenantKey) return;
    seededFor.current = tenantKey;
    setOrg(tenantToOrg(t));
    setOrgNote("");
  }, [orgQuery.data, showOrgEdit, tenantKey]);

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
        // Party 1 signature (drawn or uploaded) — fills {{signature.tenant}}.
        signature: org.signature || "",
      });
      const t = res.data || {};
      // Keep the cache in step so a later remount doesn't show the old data.
      queryClient.setQueryData(["tenant-current", tenantKey], (prev) => ({ ...(prev || {}), ...t }));
      setOrg((prev) => ({
        ...prev,
        email: t.email || "",
        phone: t.phone || "",
        address: t.address || "",
        registrationNumber: t.registrationNumber || t.registration_number || "",
        signature: t.signature || "",
      }));
      setShowOrgEdit(false);
      setSigMode("upload");
    } catch (err) {
      setOrgNote(getErrorMessage(err));
    } finally {
      setOrgSaving(false);
    }
  };

  const onSignatureFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToSignatureDataUrl(file);
      setOrg((p) => ({ ...p, signature: dataUrl }));
      setOrgNote("");
    } catch (err) {
      setOrgNote(err?.message || "Failed to read the signature image.");
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
          <span className="org-summary__row">
            Signature: {org.signature ? "on file" : "not saved"}
            {" · "}
            Stamp: {org.stamp ? "on file" : "not uploaded"}
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
      {(orgNote || orgFetchError) && !showOrgEdit ? (
        <span className="org-summary__note">{orgNote || orgFetchError}</span>
      ) : null}
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
      {/* key=tenant: a tenant switch remounts the tab, so the editor, banner,
          and detected fields reset instead of carrying the old tenant's work. */}
      {tab === "builder" ? <SchemaFormsBuilder /> : <TemplatesTab key={tenantKey || "home"} org={org} />}
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
                  <div className="sigCapture">
                    <div className="adminRow" style={{ gap: 8 }}>
                      <label style={{ margin: 0 }}>Party 1 signature — used in templates ({`{{signature.tenant}}`})</label>
                      <div className="segmented-toggle" role="tablist" aria-label="Signature input mode">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={sigMode === "upload"}
                          className={`segmented-toggle-btn${sigMode === "upload" ? " active" : ""}`}
                          onClick={() => setSigMode("upload")}
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={sigMode === "draw"}
                          className={`segmented-toggle-btn${sigMode === "draw" ? " active" : ""}`}
                          onClick={() => setSigMode("draw")}
                        >
                          Draw
                        </button>
                      </div>
                    </div>
                    {sigMode === "upload" ? (
                      <div className="adminRow" style={{ gap: 8 }}>
                        <input type="file" accept="image/*" onChange={onSignatureFile} />
                        {org.signature ? (
                          <button
                            type="button"
                            className="smallBtn"
                            onClick={() => setOrg((p) => ({ ...p, signature: "" }))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <SignaturePad
                        width={420}
                        height={140}
                        onSign={(dataUrl) => setOrg((p) => ({ ...p, signature: dataUrl }))}
                      />
                    )}
                    {org.signature ? (
                      <div className="sigCapture__preview">
                        <img src={org.signature} alt="Saved Party 1 signature" />
                      </div>
                    ) : (
                      <p className="doc-form-note" style={{ margin: "4px 0 0" }}>
                        No signature saved yet — templates show a blank signature line until you add one.
                      </p>
                    )}
                  </div>
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
