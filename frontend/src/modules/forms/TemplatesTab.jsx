import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import useAuth from "../../hooks/useAuth";
import { extractTemplateText, fileToAgreementHtml, sanitizeHtml, textToStructuredHtml } from "../../lib/agreementFormatter";
import { PLACEHOLDER_TAGS, resolvePlaceholdersClient } from "../../lib/placeholders";
import "../../styles/schema-forms.css";
import "../../styles/doctors.css";

// Mirrors TEMPLATE_PARTY_FIELDS in shared/src/placeholders.js: the org fields
// a tenant admin can pick for Party 1 of a template.
const PARTY_FIELD_OPTIONS = [
  { key: "name", label: "Organization name" },
  { key: "code", label: "Organization code" },
  { key: "email", label: "Organization email" },
  { key: "phone", label: "Organization phone" },
  { key: "address", label: "Organization address" },
  { key: "registration_number", label: "Organization registration no." },
];

const DOCTOR_BLANK_OPTIONS = PLACEHOLDER_TAGS;

const EMPTY_EDITOR = { _id: "", name: "", partyFields: ["name"], bodyText: "" };

const TEMPLATE_PROMPT = `Write a tenancy / service agreement as plain text I can paste as a template.

Rules:
- Use {{tenant.name}}, {{tenant.email}}, {{tenant.phone}}, {{tenant.address}}, {{tenant.registration_number}} for Party 1 (my organization).
- Use {{doctor.name}}, {{doctor.email}}, {{doctor.phone}}, {{doctor.address}} for Party 2 (the doctor).
- Use {{date}} for today. Any other fill-in (rent, dates, amounts) stays as {{CAPITAL_WORDS}}.
- Keep headings with # and plain paragraphs. No signature images needed.

Example sections: title, between, purpose, term, rent, obligations, termination, governing law, signatures.`;

function tenantPreviewContext(org) {
  return {
    "tenant.name": org.name || "",
    "tenant.code": org.code || "",
    "tenant.email": org.email || "",
    "tenant.phone": org.phone || "",
    "tenant.address": org.address || "",
    "tenant.registration_number": org.registrationNumber || "",
    date: new Date().toISOString().slice(0, 10),
  };
}

function TemplatesTab() {
  const { tenantContextId, isSuperAdmin } = useAuth();
  const [org, setOrg] = useState({ name: "", code: "", email: "", phone: "", address: "", registrationNumber: "" });
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgNote, setOrgNote] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [showOrgEdit, setShowOrgEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");
  const [uploading, setUploading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const bodyRef = useRef(null);
  const fileRef = useRef(null);

  // Save/delete reload the list — setState inside .then callbacks is fine.
  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get("/forms/templates");
      setTemplates(Array.isArray(res.data) ? res.data : []);
      setTemplatesLoading(false);
    } catch (err) {
      setBanner(getErrorMessage(err));
      setTemplatesLoading(false);
    }
  }, []);

  // Load both on mount + every tenant switch — super admin designs per tenant
  // via the header override, so org + templates must follow tenantKey.
  // The ref guard means the effect body runs at most once per tenant, so the
  // dep array never changes size between renders.
  const tenantKey = String(tenantContextId || "");
  const loadedFor = useRef("");
  useEffect(() => {
    if (loadedFor.current === tenantKey) return;
    loadedFor.current = tenantKey;
    let active = true;
    setOrgLoading(true);
    setTemplatesLoading(true);
    setBanner("");
    setOrgNote("");
    setEditor(EMPTY_EDITOR);
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
    api
      .get("/forms/templates")
      .then((res) => {
        if (!active) return;
        setTemplates(Array.isArray(res.data) ? res.data : []);
        setTemplatesLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setBanner(getErrorMessage(err));
        setTemplatesLoading(false);
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
        email: org.email || "",
        phone: org.phone || "",
        address: org.address || "",
        registrationNumber: org.registrationNumber || "",
      });
      const t = res.data || {};
      setOrg((prev) => ({
        ...prev,
        email: t.email || "",
        phone: t.phone || "",
        address: t.address || "",
        registrationNumber: t.registrationNumber || t.registration_number || "",
      }));
      setOrgNote("Organization data saved — templates use it as Party 1.");
      setShowOrgEdit(false);
    } catch (err) {
      setOrgNote(getErrorMessage(err));
    } finally {
      setOrgSaving(false);
    }
  };

  const togglePartyField = (key) => {
    setEditor((prev) => ({
      ...prev,
      partyFields: prev.partyFields.includes(key)
        ? prev.partyFields.filter((k) => k !== key)
        : [...prev.partyFields, key],
    }));
  };

  const insertBlank = (tag) => {
    if (!tag) return;
    const area = bodyRef.current;
    const current = editor.bodyText || "";
    if (!area) {
      setEditor((prev) => ({ ...prev, bodyText: `${current}{{${tag}}}` }));
      return;
    }
    const start = area.selectionStart ?? current.length;
    const end = area.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}{{${tag}}}${current.slice(end)}`;
    setEditor((prev) => ({ ...prev, bodyText: next }));
    requestAnimationFrame(() => {
      area.focus();
      const pos = start + tag.length + 4;
      try {
        area.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  };

  const onTemplateFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setBanner("");
    try {
      const name = String(file.name || "").toLowerCase();
      let text = "";
      if (name.endsWith(".txt") || name.endsWith(".md")) {
        text = await file.text();
      } else {
        const html = await fileToAgreementHtml(file);
        text = extractTemplateText(html);
      }
      if (!text.trim()) {
        setBanner("Could not extract any text from this file. Paste the agreement manually.");
        return;
      }
      setEditor((prev) => ({
        ...prev,
        name: prev.name || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
        bodyText: prev.bodyText ? `${prev.bodyText.trim()}\n\n${text.trim()}` : text.trim(),
      }));
    } catch (err) {
      setBanner(err?.message || "Failed to read the document.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(TEMPLATE_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setBanner("Unable to copy (clipboard permission). Select the prompt text manually.");
    }
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    if (!editor.name.trim()) {
      setBanner("Give the template a name.");
      return;
    }
    if (!String(editor.bodyText || "").trim()) {
      setBanner("Paste the agreement text or upload a document first.");
      return;
    }
    setSaving(true);
    setBanner("");
    try {
      const payload = { name: editor.name.trim(), bodyText: editor.bodyText || "", partyFields: editor.partyFields };
      if (editor._id) {
        await api.put(`/forms/templates/${editor._id}`, payload);
      } else {
        await api.post("/forms/templates", payload);
      }
      setEditor(EMPTY_EDITOR);
      await loadTemplates();
    } catch (err) {
      setBanner(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"? Forms using it will need another template.`)) return;
    try {
      await api.delete(`/forms/templates/${id}`);
      if (editor._id === id) setEditor(EMPTY_EDITOR);
      await loadTemplates();
    } catch (err) {
      setBanner(getErrorMessage(err));
    }
  };

  if (isSuperAdmin && !tenantContextId) {
    return (
      <div className="schema-forms">
        <div className="builderCard">
          <h2>Templates</h2>
          <p className="doc-form-note">
            Templates belong to one tenant. Pick a tenant in the top bar (instead of Home) to design theirs.
          </p>
        </div>
      </div>
    );
  }

  const previewCtx = tenantPreviewContext(org);
  const previewBody = resolvePlaceholdersClient(editor.bodyText || "", previewCtx);
  const partyRows = PARTY_FIELD_OPTIONS.filter((o) => editor.partyFields.includes(o.key)).map((o) => ({
    label: o.label,
    value: previewCtx[`tenant.${o.key}`] || "",
  })).filter((r) => r.value);

  return (
    <div className="schema-forms">
      <div className="builderCard">
        <div className="adminRow">
          <h2>Organization data (Party 1)</h2>
          <button type="button" className="ioButton ioButton--sm" onClick={() => { setOrgNote(""); setShowOrgEdit(true); }}>
            Edit
          </button>
        </div>
        <p className="doc-form-note">
          This tenant is Party 1 of every template.
        </p>
        {orgLoading ? (
          <p className="doc-form-note">Loading organization…</p>
        ) : (
          <div className="grid">
            <div className="field">
              <label>Organization name</label>
              <div>{org.name || "—"}</div>
            </div>
            <div className="field">
              <label>Organization code</label>
              <div>{org.code || "—"}</div>
            </div>
            <div className="field">
              <label>Email</label>
              <div>{org.email || "—"}</div>
            </div>
            <div className="field">
              <label>Phone</label>
              <div>{org.phone || "—"}</div>
            </div>
          </div>
        )}
        {orgNote && !showOrgEdit ? <p className="doc-form-note" style={{ marginTop: 8 }}>{orgNote}</p> : null}
      </div>
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

      <div className="builderCard">
        <h2>Templates</h2>
        {banner ? <div className="fieldError">{banner}</div> : null}
        {templatesLoading ? (
          <p className="doc-form-note">Loading templates…</p>
        ) : templates.length ? (
          <ul className="doc-field-list">
            {templates.map((t) => (
              <li key={String(t._id)}>
                <span className="doc-field-label">
                  {t.name}
                  <br />
                  <span className="doc-form-note">
                    {(t.partyFields || []).length} org field{(t.partyFields || []).length === 1 ? "" : "s"} · updated{" "}
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
                  </span>
                </span>
                <span className="doc-field-type" style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="doc-action-btn doc-action-btn--view"
                    onClick={() => setEditor({ _id: String(t._id), name: t.name || "", partyFields: t.partyFields || [], bodyText: t.bodyText || "" })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn doc-action-btn--danger"
                    onClick={() => deleteTemplate(t._id, t.name)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="doc-form-note">No templates yet — design the first one below.</p>
        )}
      </div>

      <div className="builderCard">
        <h2>Standard prompt — generate an agreement anywhere</h2>
        <p className="doc-form-note">
          Copy this prompt into ChatGPT or any writer, get the agreement back, then paste it
          above and save. That is the whole flow.
        </p>
        <textarea rows={8} readOnly value={TEMPLATE_PROMPT} onFocus={(e) => e.target.select()} />
        <div className="adminRow" style={{ marginTop: 8 }}>
          <button type="button" className="btn-secondary" onClick={copyPrompt}>
            {promptCopied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      </div>

      <div className="builderCard">
        <h2>{editor._id ? `Edit template — ${editor.name}` : "New template"}</h2>
        <form onSubmit={saveTemplate}>
          <label>Template name *</label>
          <input
            value={editor.name}
            onChange={(e) => setEditor((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Service Agreement"
          />

          <div className="stacked-label" style={{ marginTop: 12 }}>
            <span>Organization fields in Party 1</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 4 }}>
            {PARTY_FIELD_OPTIONS.map((o) => (
              <label key={o.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={editor.partyFields.includes(o.key)}
                  onChange={() => togglePartyField(o.key)}
                />
                {o.label}
              </label>
            ))}
          </div>

          <label htmlFor="template-body">Agreement text — paste or upload a document</label>
          <div className="adminRow" style={{ gap: 8, marginBottom: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onTemplateFile}
              disabled={uploading}
            />
            {uploading ? <span className="doc-form-note" style={{ margin: 0 }}>Reading document…</span> : null}
          </div>
          <textarea
            id="template-body"
            ref={bodyRef}
            rows={10}
            value={editor.bodyText}
            onChange={(e) => setEditor((p) => ({ ...p, bodyText: e.target.value }))}
            placeholder={"Paste the agreement here, e.g. BASIC TENANCY AGREEMENT with blanks like {{AGREEMENT_DATE}}, {{tenant.name}} and {{doctor.name}}. Upload a .txt, .md, .docx or .pdf above to fill this in."}
          />
          <div className="adminRow" style={{ gap: 8, marginTop: 8 }}>
            <label htmlFor="template-blank" style={{ margin: 0 }}>Insert placeholder</label>
            <select id="template-blank" value="" onChange={(e) => insertBlank(e.target.value)}>
              <option value="">Choose placeholder…</option>
              {DOCTOR_BLANK_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} {`{{${o.key}}}`}
                </option>
              ))}
            </select>
          </div>
          <p className="doc-form-note">
            {"{{tenant.*}}"} fills from this tenant at form setup, {"{{doctor.*}}"} fills from the
            doctor at assign time, {"{{date}}"} is today. Any other {"{{CAPITAL_WORDS}}"} stays
            visible on the link.
          </p>

          <h3>Preview</h3>
          <div className="agreementPreview">
            <div className="templateAgreement">
              <div className="templateParty" data-party="tenant">
                <h3>Party 1 — {org.name || "Organization"}</h3>
                {partyRows.length ? (
                  <dl className="templatePartyRows">
                    {partyRows.map((r) => (
                      <div className="templatePartyRow" key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="doc-form-note" style={{ margin: 0 }}>No org fields ticked.</p>
                )}
              </div>
              <div className="templateBody">
                {previewBody.trim() ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(textToStructuredHtml(previewBody)) }} />
                ) : (
                  <p className="doc-form-note" style={{ margin: 0 }}>Body preview appears here.</p>
                )}
              </div>
            </div>
          </div>

          <div className="adminRow" style={{ marginTop: 12 }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : editor._id ? "Save template" : "Create template"}
            </button>
            {editor._id ? (
              <button type="button" className="btn-secondary" onClick={() => setEditor(EMPTY_EDITOR)}>
                New template
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default TemplatesTab;
