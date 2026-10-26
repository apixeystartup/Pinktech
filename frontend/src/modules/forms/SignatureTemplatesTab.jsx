import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import useAuth from "../../hooks/useAuth";
import api from "../../lib/api";
import {
  createSignTemplate,
  deleteSignTemplate,
  fetchSignTemplateDocument,
  listSignTemplates,
  sendFromTemplate,
  saveTenantProfilePartial,
  updateSignTemplate,
  uploadSignTemplateDocument,
} from "../../lib/signApi";
import PdfFieldCanvas from "../../components/sign/PdfFieldCanvas";
import "./../../styles/sign-designer.css";

const PALETTE = [
  { key: "p2sig", tag: "signature.doctor", type: "SIGNATURE", label: "Party 2 signature" },
  { key: "p1name", tag: "tenant.name", type: "TEXT", label: "Party 1 name" },
  { key: "p1addr", tag: "tenant.address", type: "TEXT", label: "Party 1 address" },
  { key: "p1text", tag: "tenant.custom", type: "TEXT", label: "Party 1 text field" },
  { key: "p1sig", tag: "signature.tenant", type: "IMAGE", label: "Party 1 signature" },
  { key: "p1stamp", tag: "stamp", type: "IMAGE", label: "Party 1 stamp" },
  { key: "p2name", tag: "doctor.name", type: "TEXT", label: "Party 2 name" },
  { key: "p2addr", tag: "doctor.address", type: "TEXT", label: "Party 2 address" },
  { key: "p2text", tag: "custom.party2_text", type: "TEXT", label: "Party 2 text field" },
  { key: "date", tag: "date", type: "DATE", label: "Date" },
];

const PALETTE_SECTIONS = [
  { key: "party2", label: "Party 2", hint: "Signer fields", fieldKeys: ["p2sig", "p2name", "p2addr", "p2text"] },
  { key: "party1", label: "Party 1", hint: "Organization fields", fieldKeys: ["p1name", "p1addr", "p1text", "p1sig", "p1stamp"] },
  { key: "other", label: "Other", hint: "Shared agreement details", fieldKeys: ["date"] },
];

function genCid() {
  try { return crypto.randomUUID(); } catch { return String(Date.now() + Math.random()); }
}

function normalizeFields(list) {
  return (list || []).map((f) => ({
    cid: f._id || genCid(),
    tag: String(f.tag || "").toLowerCase(),
    type: f.type || "TEXT",
    label: f.label || "",
    value: f.value || "",
    page: f.page || 0,
    x: f.x ?? 0,
    y: f.y ?? 0,
    w: f.w ?? 20,
    h: f.h ?? 5,
    required: f.required !== false,
  }));
}

function PaletteIcon({ type }) {
  if (type === "TEXT") {
    return <span className="signPaletteItem__icon signPaletteItem__icon--text" aria-hidden="true">T</span>;
  }
  const shapes = {
    SIGNATURE: (
      <>
        <path d="M12 19.5 19.5 12l3 3L15 22.5l-3.75.75z" />
        <path d="M18 13.5 16.5 6 20 2.5 23.5 6z" />
        <path d="M4 20l6-2 10-10-4-4L6 14z" />
      </>
    ),
    IMAGE: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    DATE: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
  };
  return (
    <svg
      className="signPaletteItem__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[type] || shapes.DATE}
    </svg>
  );
}

export default function SignatureTemplatesTab({ org, onDesigningChange }) {
  const { tenantContextId, currentTenant } = useAuth();
  const mapOrg = (source) => ({
    name: source?.name || "",
    code: source?.code || "",
    email: source?.email || "",
    phone: source?.phone || "",
    address: source?.address || "",
    registrationNumber: source?.registrationNumber || source?.registration_number || "",
    signature: source?.signature || "",
    stamp: source?.stamp || "",
  });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localOrg, setLocalOrg] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("pink:org:" + String(tenantContextId || "")) || "null");
      if (cached) return mapOrg(cached);
    } catch { /* ignore */ }
    return mapOrg(currentTenant || org || {});
  });
  const orgQuery = useQuery({
    queryKey: ["tenant-current", String(tenantContextId || "")],
    queryFn: async () => (await api.get("/tenants/current")).data || null,
    staleTime: 60000,
  });
  const [editing, setEditing] = useState(null); // { template, name, fields }
  const [saving, setSaving] = useState(false);
  const [selectedCid, setSelectedCid] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef(null);

  // Retained for compatibility; UI Send was removed per request.
  const [sendFor, setSendFor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [sendDoctorId, setSendDoctorId] = useState("");
  const [sendTitle, setSendTitle] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendError, setSendError] = useState("");

  const hasSig = Boolean(localOrg?.signature);
  const hasStamp = Boolean(localOrg?.stamp);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listSignTemplates();
      setTemplates(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not load signature templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const [propertiesOpen, setPropertiesOpen] = useState(false);

  useEffect(() => {
    const source = currentTenant || orgQuery.data || org;
    if (!source) return;
    const mapped = mapOrg(source);
    setLocalOrg(mapped);
    try {
      localStorage.setItem("pink:org:" + String(tenantContextId || ""), JSON.stringify(source));
    } catch { /* ignore quota */ }
  }, [org, orgQuery.data, currentTenant, tenantContextId]);

  useEffect(() => {
    if (!editing?.template?._id) {
      setDocUrl("");
      return;
    }
    if (!editing.template.document) {
      setDocUrl("");
      return;
    }
    let revoke = "";
    fetchSignTemplateDocument(editing.template._id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setDocUrl(url);
      })
      .catch(() => setDocUrl(""));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [editing?.template?._id, editing?.template?.document?._id]);

  useEffect(() => {
    if (!sendFor) return;
    (async () => {
      try {
        const api = (await import("../../lib/api")).default;
        const res = await api.get("/doctors");
        const d = res.data;
        setDoctors(Array.isArray(d) ? d : (d?.items || d?.data || []));
      } catch {
        setDoctors([]);
      }
    })();
  }, [sendFor]);

  const selectedField = useMemo(
    () => (editing?.fields || []).find((f) => f.cid === selectedCid) || null,
    [editing?.fields, selectedCid],
  );

  async function handleCreate() {
    setError("");
    try {
      const t = await createSignTemplate("Untitled signature template");
      setTemplates((prev) => [t, ...prev]);
      openDesign(t);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not create template.");
    }
  }

  function openDesign(t) {
    setDocUrl("");
    setEditing({ template: t, name: t.name || "", fields: normalizeFields(t.fields) });
    setSelectedCid("");
    setPropertiesOpen(false);
    // The page header collapses while the designer owns the screen (Screen 17).
    onDesigningChange?.(true);
  }

  function closeDesign() {
    setEditing(null);
    setSelectedCid("");
    setPropertiesOpen(false);
    onDesigningChange?.(false);
  }

  function selectField(cid) {
    setSelectedCid(cid);
    setPropertiesOpen(Boolean(cid));
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this signature template?")) return;
    try {
      await deleteSignTemplate(id);
      if (editing?.template?._id === id) {
        setEditing(null);
        onDesigningChange?.(false);
      }
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not delete template.");
    }
  }

  function updateEditing(mutator) {
    setEditing((prev) => (prev ? mutator(prev) : prev));
  }

  function handleFieldChange(cid, patch) {
    updateEditing((prev) => ({ ...prev, fields: prev.fields.map((f) => (f.cid === cid ? { ...f, ...patch } : f)) }));
  }

  function handleAddField(payload) {
    const cid = genCid();
    updateEditing((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          cid,
          tag: payload.tag,
          type: payload.type,
          label: payload.label,
          value: payload.value || "",
          page: payload.page || 0,
          x: payload.x,
          y: payload.y,
          w: payload.w,
          h: payload.h,
          required: true,
        },
      ],
    }));
    setSelectedCid(cid);
    setPropertiesOpen(true);
  }

  function handleDeleteSelected() {
    if (!selectedCid) return;
    updateEditing((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.cid !== selectedCid) }));
    setSelectedCid("");
    setPropertiesOpen(false);
  }

  async function handleUpload(file) {
    if (!file || !editing?.template?._id) return;
    const localUrl = URL.createObjectURL(file);
    setDocUrl(localUrl);
    setUploadBusy(true);
    setError("");
    try {
      const updated = await uploadSignTemplateDocument(editing.template._id, file, 0);
      updateEditing((prev) => ({ ...prev, template: updated }));
      await loadTemplates();
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not upload agreement.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleSaveDesign() {
    if (!editing) return;
    const missingPartyOneText = (editing.fields || []).find(
      (field) => field.tag === "tenant.custom" && !String(field.value || "").trim(),
    );
    if (missingPartyOneText) {
      setSelectedCid(missingPartyOneText.cid);
      setError(`Enter a value for the Party 1 text field "${missingPartyOneText.label || missingPartyOneText.tag}" before saving this agreement.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: editing.name.trim() || "Untitled signature template",
        fields: (editing.fields || []).map(({ cid, _id, ...rest }) => rest),
      };
      const updated = await updateSignTemplate(editing.template._id, payload);
      updateEditing((prev) => ({ ...prev, template: updated, name: updated.name, fields: normalizeFields(updated.fields) }));
      await loadTemplates();
      setNotice("Layout saved.");
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not save layout.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStampFile(file) {
    if (!file) return;
    setNotice("");
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    try {
      await saveTenantProfilePartial({ stamp: dataUrl });
      setLocalOrg((prev) => ({ ...prev, stamp: dataUrl }));
      setNotice("Stamp saved to organization data.");
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Could not save stamp.");
    }
  }

  async function handleSend() {
    if (!sendFor || !sendDoctorId) return;
    setSendBusy(true);
    setSendError("");
    try {
      const res = await sendFromTemplate(sendFor._id, {
        doctorId: sendDoctorId,
        title: sendTitle.trim() || undefined,
      });
      setSendResult(res);
    } catch (e) {
      setSendError(e?.response?.data?.message || e.message || "Could not send signature request.");
    } finally {
      setSendBusy(false);
    }
  }

  function copy(text) {
    try {
      navigator.clipboard?.writeText(text);
      setNotice("Link copied to clipboard.");
      setTimeout(() => setNotice(""), 1500);
    } catch { /* ignore */ }
  }

  if (editing) {
    const paletteByKey = Object.fromEntries(PALETTE.map((field) => [field.key, field]));
    return (
      <div className="schema-forms signDesigner">
        <div className="signDesigner__bar">
          <div className="signDesigner__barTop">
            <button type="button" className="ghostBtn signDesigner__close" onClick={closeDesign}>
              ← Back to templates
            </button>
          </div>
          <div className="signDesigner__barMain">
            <label className="signDesigner__nameField">
              <span>Agreement name</span>
              <input
                className="signDesigner__nameInput"
                value={editing.name}
                onChange={(e) => updateEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Doctor onboarding agreement"
              />
            </label>
            <div className="signDesigner__barActions signDesigner__actions">
              <label className="ioButton ioButton--sm signDesigner__uploadButton">
                {uploadBusy ? "Uploading…" : editing.template.document ? "Replace document" : "Upload agreement"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
                  style={{ display: "none" }}
                  disabled={uploadBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" className="ioButton ioButton--sm signDesigner__saveButton" disabled={saving || uploadBusy} onClick={handleSaveDesign}>
                {saving ? "Saving…" : "Save layout"}
              </button>
            </div>
          </div>
        </div>
        {error ? <div className="fieldError">{error}</div> : null}
        {notice ? <div className="doc-form-note">{notice}</div> : null}
        <div className={`signDesigner__body signDesigner__body--editing${propertiesOpen ? " has-properties" : ""}`}>
          <aside className="signDesigner__palette">
            <div className="signDesigner__panelHeading">
              <div>
                <h3>Field library</h3>
                <p>Drag a field onto the document.</p>
              </div>
              <span className="signDesigner__count">{editing.fields.length}</span>
            </div>
            {PALETTE_SECTIONS.map((section) => (
              <section className="signDesigner__paletteSection" key={section.key}>
                <div className="signDesigner__sectionHeading">
                  <strong>{section.label}</strong>
                  <span>{section.hint}</span>
                </div>
                {section.fieldKeys.map((key) => {
                  const field = paletteByKey[key];
                  return (
                    <div
                      key={field.key}
                      className="signPaletteItem"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({
                        tag: field.tag,
                        type: field.type,
                        label: field.label,
                      }))}
                    >
                      <PaletteIcon type={field.type} />
                      <span className="signPaletteItem__details">
                        <span>{field.label}</span>
                        <code>{field.tag}</code>
                      </span>
                    </div>
                  );
                })}
              </section>
            ))}
            <div className="signDesigner__stampCard">
              <strong>Organization signature & stamp</strong>
              <p className="doc-form-note">
                {hasSig ? "Organization signature is ready." : "Add an organization signature in profile settings before using this field."}
              </p>
              <label className="signDesigner__stampUpload">
                {hasStamp ? "Replace stamp" : "Upload stamp"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleStampFile(f);
                  e.target.value = "";
                }} />
              </label>
            </div>
          </aside>
          <main className="signDesigner__canvas">
            <div className="signDesigner__canvasHeader">
              <div>
                <h3>{editing.template.document ? "Agreement preview" : "Your agreement document"}</h3>
              </div>
              {editing.template.document?.pages ? <span className="signDesigner__pageCount">{editing.template.document.pages} pages</span> : null}
            </div>
            {editing.template.document ? (docUrl ? (
              <PdfFieldCanvas
                pdfUrl={docUrl}
                fields={editing.fields}
                selectedId={selectedCid}
                mode="design"
                onSelect={selectField}
                onAdd={handleAddField}
                onChange={handleFieldChange}
                fitToContainer
              />
            ) : (
              <div className="signCanvasEmpty">
                <span className="signCanvasEmpty__icon" aria-hidden="true">…</span>
                <strong>Preparing your document</strong>
                <p>The agreement preview will appear here in a moment.</p>
              </div>
            )) : (
              <div className="signCanvasEmpty signCanvasEmpty--upload">
                <span className="signCanvasEmpty__icon" aria-hidden="true">PDF</span>
                <strong>Start with your agreement</strong>
                <p>Upload the PDF or DOCX you want to prepare. You can then drag fields from the library onto the right places.</p>
                <label className="ioButton signCanvasEmpty__upload">
                  {uploadBusy ? "Uploading…" : "Choose agreement file"}
                  <input type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx" style={{ display: "none" }} disabled={uploadBusy} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }} />
                </label>
                <span className="signCanvasEmpty__formats">PDF or DOCX</span>
              </div>
            )}
            <div className="signDesigner__canvasTip">
              <span aria-hidden="true">i</span>
              Drag fields onto the document. Select a placed field to edit its label, value, or position.
            </div>
          </main>
          {propertiesOpen && selectedField ? (
            <aside className="signDesigner__props">
              <div className="signDesigner__propsHeader">
                <strong>Properties</strong>
                <button
                  type="button"
                  className="signDesigner__propsClose"
                  aria-label="Close properties"
                  title="Close properties"
                  onClick={() => {
                    setSelectedCid("");
                    setPropertiesOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="wfPropsCard">
                <div className="wfPropsCard__head">
                  <strong>Placed field</strong>
                  <svg
                    className="wfPropsCard__grip"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                  </svg>
                </div>
                <label>Tag</label>
                <input value={selectedField.tag} disabled />
                <label>Type</label>
                <input value={selectedField.type} disabled />
                <label>Label</label>
                <input value={selectedField.label} onChange={(e) => handleFieldChange(selectedField.cid, { label: e.target.value })} />
                {selectedField.tag === "tenant.custom" ? (
                  <>
                    <label>Party 1 text value</label>
                    <p className="doc-form-note">Enter the value here before saving this agreement.</p>
                    <textarea
                      value={selectedField.value || ""}
                      maxLength={4000}
                      onChange={(e) => handleFieldChange(selectedField.cid, { value: e.target.value })}
                      placeholder="Enter the value to print for Party 1"
                    />
                  </>
                ) : null}
                <label className="wfPropsCard__check">
                  <input
                    type="checkbox"
                    checked={selectedField.required || selectedField.tag.startsWith("tenant.") || selectedField.tag.startsWith("custom.")}
                    disabled={selectedField.tag.startsWith("tenant.") || selectedField.tag.startsWith("custom.")}
                    onChange={(e) => handleFieldChange(selectedField.cid, { required: e.target.checked })}
                  />
                  Required
                </label>
                <div className="signDesigner__coords">
                  {["x", "y", "w", "h"].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        min={k === "w" || k === "h" ? 3 : 0}
                        max={100}
                        value={Math.round(selectedField[k])}
                        onChange={(e) => handleFieldChange(selectedField.cid, { [k]: Number(e.target.value) || 0 })}
                      />
                    </label>
                  ))}
                </div>
                <label>Page</label>
                <input
                  type="number"
                  min={0}
                  value={selectedField.page}
                  onChange={(e) => handleFieldChange(selectedField.cid, { page: Number(e.target.value) || 0 })}
                />
                <button type="button" className="signDesigner__deleteField" onClick={handleDeleteSelected}>
                  <span aria-hidden="true">×</span>
                  Delete field
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="schema-forms wfTemplates">
      {error ? <div className="fieldError">{error}</div> : null}
      {notice ? <div className="doc-form-note">{notice}</div> : null}

      <section className="wfTemplates__section">
        <div className="wfSectionHead">
          <h2>Agreement templates</h2>
          <button type="button" className="wfBtn wfBtn--khaki wfBtn--sm" onClick={handleCreate}>
            + Add template
          </button>
        </div>
        {loading ? <p className="doc-form-note">Loading…</p> : null}
        {!loading && !templates.length ? (
          <div className="wfEmpty">
            <strong>No agreement templates yet</strong>
            <p>Click “+ Add template” to upload the PDF you want parties to sign.</p>
          </div>
        ) : null}
        <div className="signTemplateGrid wfSignGrid">
          {templates.map((t) => (
            <article key={String(t._id)} className="signCard">
              <div className="signCard__thumb">
                <div className="signCard__thumbDoc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                </div>
                <span className="signCard__thumbCount">{t.fieldCount || 0}</span>
              </div>
              <div className="signCard__body">
                <div className="signCard__titleRow">
                  <h3 className="signCard__title" title={t.name || "Untitled"}>{t.name || "Untitled"}</h3>
                  <span className="wfBadge">{t.document ? "Published" : "Draft"}</span>
                </div>
                <p className="signCard__meta">
                  {t.document ? t.document.name : "No agreement uploaded"}
                </p>
                <p className="signCard__meta signCard__meta--sub">
                  {t.fieldCount || 0} field{Number(t.fieldCount) === 1 ? "" : "s"} placed
                  {t.document?.pages ? ` · ${t.document.pages} page${Number(t.document.pages) === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <div className="signCard__actions">
                <button type="button" className="wfBtn wfBtn--khaki" onClick={() => openDesign(t)}>Edit template</button>
                <button type="button" className="wfBtn wfBtn--ghost" onClick={() => handleDelete(t._id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {sendFor ? (
        <div className="form-editor-backdrop" onClick={() => setSendFor(null)}>
          <div className="form-editor-modal schema-forms" onClick={(e) => e.stopPropagation()}>
            <div className="builderCard">
              <div className="adminRow">
                <h2>Send "{sendFor.name}"</h2>
                <button type="button" className="ghostBtn" onClick={() => setSendFor(null)}>Close</button>
              </div>
              {sendError ? <div className="fieldError">{sendError}</div> : null}
              {sendResult ? (
                <>
                  <p className="doc-form-note">Sent. {sendResult.emailed ? "The signing link was emailed to the doctor." : "Email not configured — copy the link below to share it."}</p>
                  { (sendResult.signingLinks || []).map((l) => (
                    <div key={l.recipientId} className="adminRow" style={{ justifyContent: "space-between", gap: 8 }}>
                      <a href={l.url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{l.url}</a>
                      <button type="button" className="ioButton ioButton--sm" onClick={() => copy(l.url)}>Copy</button>
                    </div>
                  )) }
                </>
              ) : (
                <>
                  <label>Doctor (Party 2) *</label>
                  <select value={sendDoctorId} onChange={(e) => setSendDoctorId(e.target.value)}>
                    <option value="">Select a doctor…</option>
                    {doctors.map((d) => (
                      <option key={d._id || d.id} value={d._id || d.id}>{d.name} ({d.email || d.doctorCode || ""})</option>
                    ))}
                  </select>
                  {doctors.length === 0 ? <p className="doc-form-note">No doctors found. Add doctors first.</p> : null}
                  <label>Agreement title</label>
                  <input value={sendTitle} onChange={(e) => setSendTitle(e.target.value)} placeholder={sendFor.name} />
                  <div className="adminRow" style={{ marginTop: 12 }}>
                    <button type="button" className="btn-primary" disabled={!sendDoctorId || sendBusy} onClick={handleSend}>
                      {sendBusy ? "Sending…" : "Send for signature"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
