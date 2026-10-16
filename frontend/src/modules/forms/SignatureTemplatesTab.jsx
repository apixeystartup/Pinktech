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
  { key: "p1sig", tag: "signature.tenant", type: "IMAGE", label: "Party 1 signature" },
  { key: "p1stamp", tag: "stamp", type: "IMAGE", label: "Party 1 stamp" },
  { key: "p2name", tag: "doctor.name", type: "TEXT", label: "Party 2 name" },
  { key: "p2addr", tag: "doctor.address", type: "TEXT", label: "Party 2 address" },
  { key: "date", tag: "date", type: "DATE", label: "Date" },
  { key: "custom", tag: "custom.notes", type: "TEXT", label: "Text (custom)" },
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
    page: f.page || 0,
    x: f.x ?? 0,
    y: f.y ?? 0,
    w: f.w ?? 20,
    h: f.h ?? 5,
    required: f.required !== false,
  }));
}

export default function SignatureTemplatesTab({ org }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localOrg, setLocalOrg] = useState(org || {});
  const { tenantContextId, currentTenant } = useAuth();
  const orgQuery = useQuery({
    queryKey: ["tenant-current", String(tenantContextId || "")],
    queryFn: async () => (await api.get("/tenants/current")).data || null,
    staleTime: 60000,
  });
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
  const [editing, setEditing] = useState(null); // { template, name, fields }
  const [saving, setSaving] = useState(false);
  const [selectedCid, setSelectedCid] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef(null);

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

  useEffect(() => {
    const source = currentTenant || orgQuery.data || org;
    if (!source) return;
    setLocalOrg(mapOrg(source));
  }, [org, orgQuery.data, currentTenant]);

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
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this signature template?")) return;
    try {
      await deleteSignTemplate(id);
      if (editing?.template?._id === id) setEditing(null);
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
  }

  function handleDeleteSelected() {
    if (!selectedCid) return;
    updateEditing((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.cid !== selectedCid) }));
    setSelectedCid("");
  }

  async function handleUpload(file) {
    if (!file || !editing?.template?._id) return;
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
    const signingReadyPalette = PALETTE.map((p) => ({
      ...p,
      payload: { tag: p.tag, type: p.type, label: p.label },
    }));
    return (
      <div className="signDesigner">
        <div className="signDesigner__bar">
          <input
            className="signDesigner__nameInput"
            value={editing.name}
            onChange={(e) => updateEditing((p) => ({ ...p, name: e.target.value }))}
            placeholder="Template name"
          />
          <div className="signDesigner__barActions">
            <label className="ioButton ioButton--sm" style={{ display: "inline-block" }}>
              {uploadBusy ? "Uploading…" : "Upload agreement (PDF)"}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className="ioButton ioButton--sm" disabled={saving} onClick={handleSaveDesign}>
              {saving ? "Saving…" : "Save layout"}
            </button>
            <button type="button" className="ghostBtn" onClick={() => setEditing(null)}>
              Close
            </button>
          </div>
        </div>
        {error ? <div className="fieldError">{error}</div> : null}
        {notice ? <div className="doc-form-note">{notice}</div> : null}
        <div className="signDesigner__body">
          <aside className="signDesigner__palette">
            <strong>Drag fields onto the document</strong>
            <p className="doc-form-note">Position them where the signer needs to fill.</p>
            {signingReadyPalette.map((p) => (
              <div
                key={p.key}
                className="signPaletteItem"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify(p.payload))}
              >
                <span className={`signPaletteItem__chip signPaletteItem__chip--${p.type.toLowerCase()}`}>{p.type.slice(0, 3)}</span>
                {p.label}
              </div>
            ))}
            <div className="signDesigner__stampCard">
              <strong>Party 1 (organization)</strong>
              <p className="doc-form-note" style={{ margin: "0.25rem 0" }}>
                {hasSig ? "Signature on file" : "Add the org signature in the Templates tab first."}
              </p>
              <label className="ioButton ioButton--sm" style={{ display: "inline-block" }}>
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
            {editing.template.document ? (docUrl ? (
              <PdfFieldCanvas
                pdfUrl={docUrl}
                fields={editing.fields}
                selectedId={selectedCid}
                mode="design"
                onSelect={setSelectedCid}
                onAdd={handleAddField}
                onChange={handleFieldChange}
                onDelete={(cid) => {
                  updateEditing((p) => ({ ...p, fields: p.fields.filter((f) => f.cid !== cid) }));
                  if (selectedCid === cid) setSelectedCid("");
                }}
              />
            ) : (
              <div className="signCanvasEmpty">Loading document…</div>
            )) : (
              <div className="signCanvasEmpty">
                <p>No agreement uploaded yet.</p>
                <label className="ioButton ioButton--sm">
                  {uploadBusy ? "Uploading…" : "Upload agreement (PDF)"}
                  <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={uploadBusy} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }} />
                </label>
              </div>
            )}
            <p className="doc-form-note">
              Coordinates are stored as page percentages, so placement scales to any screen.
            </p>
          </main>
          <aside className="signDesigner__props">
            <strong>Field properties</strong>
            {selectedField ? (
              <>
                <label>Tag</label>
                <input value={selectedField.tag} disabled />
                <label>Type</label>
                <input value={selectedField.type} disabled />
                <label>Label</label>
                <input value={selectedField.label} onChange={(e) => handleFieldChange(selectedField.cid, { label: e.target.value })} />
                <label>
                  <input type="checkbox" checked={selectedField.required} onChange={(e) => handleFieldChange(selectedField.cid, { required: e.target.checked })} />
                  Required
                </label>
                <div className="signDesigner__coords">
                  {["x", "y", "w", "h"].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        min={0}
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
                <button type="button" className="dangerBtn miniBtn" onClick={handleDeleteSelected}>Delete field</button>
              </>
            ) : (
              <p className="doc-form-note">Click a placed field to edit its properties. Drag fields from the left palette onto the document.</p>
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="schema-forms">
      {error ? <div className="fieldError">{error}</div> : null}
      {notice ? <div className="doc-form-note">{notice}</div> : null}
      <div className="builderCard">
        <div className="adminRow">
          <h2>Signature templates</h2>
          <button type="button" className="ioButton ioButton--sm" onClick={handleCreate}>+ Add template</button>
        </div>
        {loading ? <p className="doc-form-note">Loading…</p> : null}
        {!loading && !templates.length ? (
          <p className="doc-form-note">No signature templates yet - click "+ Add template" to start.</p>
        ) : null}
        <div className="schema-forms-module-grid" style={{ marginTop: "1rem" }}>
          {templates.map((t) => (
            <article key={String(t._id)} className="schema-forms-module-card">
              <div className="schema-forms-module-card__head">
                <h3 className="schema-forms-module-card__title">{t.name || "Untitled"}</h3>
              </div>
              <p className="schema-forms-module-card__meta">
                {t.document ? `Agreement: ${t.document.name}` : "No agreement uploaded"}{" · "}
                {t.fieldCount || 0} field{Number(t.fieldCount) === 1 ? "" : "s"}
              </p>
              <div className="schema-forms-module-card__actions">
                <button type="button" className="ioButton ioButton--sm" onClick={() => openDesign(t)}>Edit</button>
                <button type="button" className="dangerBtn miniBtn" onClick={() => handleDelete(t._id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>

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
