import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import useAuth from "../../hooks/useAuth";
import { extractTemplateText, fileToAgreementHtml, sanitizeHtml, textToStructuredHtml } from "../../lib/agreementFormatter";
import { resolvePlaceholdersClient } from "../../lib/placeholders";
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

function TemplatesTab({ org }) {
  const { tenantContextId, isSuperAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [showEditor, setShowEditor] = useState(false);
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

  // Load on mount + every tenant switch — super admin designs per tenant
  // via the header override, so templates must follow tenantKey.
  // The ref guard means the effect body runs at most once per tenant, so the
  // dep array never changes size between renders.
  const tenantKey = String(tenantContextId || "");
  const loadedFor = useRef("");
  useEffect(() => {
    if (loadedFor.current === tenantKey) return;
    loadedFor.current = tenantKey;
    let active = true;
    setTemplatesLoading(true);
    setBanner("");
    setEditor(EMPTY_EDITOR);
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
      setShowEditor(false);
      await loadTemplates();
    } catch (err) {
      setBanner(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Lock body scroll while the editor popup is open (same as the builder).
  useEffect(() => {
    if (!showEditor) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showEditor]);

  const deleteTemplate = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"? Forms using it will need another template.`)) return;
    try {
      await api.delete(`/forms/templates/${id}`);
      if (editor._id === id) {
        setEditor(EMPTY_EDITOR);
        setShowEditor(false);
      }
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

  // "+ Add Template": blank template in the popup editor.
  const addTemplate = () => {
    setEditor(EMPTY_EDITOR);
    setBanner("");
    setShowEditor(true);
  };

  const editTemplate = (t) => {
    setBanner("");
    setEditor({ _id: String(t._id), name: t.name || "", partyFields: t.partyFields || [], bodyText: t.bodyText || "" });
    setShowEditor(true);
  };

  return (
    <div className="schema-forms">
      <div className="builderCard">
        <div className="adminRow">
          <h2>Templates</h2>
          <button type="button" className="ioButton ioButton--sm" onClick={addTemplate}>
            + Add Template
          </button>
        </div>
        {banner ? <div className="fieldError">{banner}</div> : null}
        {templatesLoading ? (
          <p className="doc-form-note">Loading templates…</p>
        ) : templates.length ? (
          <div className="schema-forms-module-grid">
            {templates.map((t) => {
              const fieldCount = (t.partyFields || []).length;
              const active = Boolean(editor._id) && editor._id === String(t._id);
              return (
                <article
                  key={String(t._id)}
                  className={`schema-forms-module-card${active ? " schema-forms-module-card--active" : ""}`}
                >
                  <div className="schema-forms-module-card__head">
                    <h3 className="schema-forms-module-card__title">{t.name || "Untitled"}</h3>
                    <span className="schema-forms-module-card__badge">Template</span>
                  </div>
                  <p className="schema-forms-module-card__meta">
                    {fieldCount} org field{fieldCount === 1 ? "" : "s"} · updated{" "}
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
                  </p>
                  <div className="schema-forms-module-card__actions">
                    <button
                      type="button"
                      className="ioButton ioButton--sm"
                      onClick={() => editTemplate(t)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="dangerBtn miniBtn"
                      onClick={() => deleteTemplate(t._id, t.name)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
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

      {/* Portal to body like the builder editor: backdrop-blur containers would
          otherwise trap the fixed overlay at their own height. */}
      {showEditor
        ? createPortal(
          <div className="form-editor-backdrop" onClick={() => setShowEditor(false)}>
            <div className="form-editor-modal schema-forms" onClick={(e) => e.stopPropagation()}>
              <div className="builderCard">
                <div className="adminRow">
                  <h2>{editor._id ? `Edit template — ${editor.name}` : "New template"}</h2>
                  <button type="button" className="ghostBtn" onClick={() => setShowEditor(false)}>
                    Close
                  </button>
                </div>
                {banner ? <div className="fieldError">{banner}</div> : null}
                <form onSubmit={saveTemplate}>
          <label>Template name *</label>
          <input
            value={editor.name}
            onChange={(e) => setEditor((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Service Agreement"
          />

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
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

export default TemplatesTab;
