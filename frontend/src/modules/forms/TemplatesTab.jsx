import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import useAuth from "../../hooks/useAuth";
import { extractTemplateText, fileToAgreementHtml, sanitizeHtml, textToStructuredHtml } from "../../lib/agreementFormatter";
import { PLACEHOLDER_TAGS, resolvePlaceholdersClient } from "../../lib/placeholders";
import "../../styles/schema-forms.css";
import "../../styles/doctors.css";

const EMPTY_EDITOR = { _id: "", name: "", partyFields: ["name"], bodyText: "", fieldValues: {} };

// Defense-in-depth before injecting the saved signature into preview HTML —
// only embedded raster data URLs pass (same rule the backend enforces).
const SAFE_SIG_RE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

const TAG_RE = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

const KNOWN_LABELS = (() => {
  const map = {};
  for (const def of PLACEHOLDER_TAGS) map[def.key] = def.label;
  return map;
})();

/**
 * Classify every {{tag}} in the body:
 *  - auto: resolved from org data / today (tenant.*, date)
 *  - party2: filled by the doctor when the link is assigned (doctor.*)
 *  - signature: rendering markers (signature.*)
 *  - unknown: the fields the author must fill — returned as inputs.
 */
function scanBodyTags(text) {
  const auto = [];
  const party2 = [];
  const signature = [];
  const unknown = [];
  const seen = new Set();
  const src = String(text || "");
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src)) !== null) {
    const key = String(m[1]).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith("tenant.") || key === "date") auto.push(key);
    else if (key.startsWith("doctor.")) party2.push(key);
    else if (key.startsWith("signature.")) signature.push(key);
    else unknown.push(key);
  }
  return { auto, party2, signature, unknown };
}

const TEMPLATE_PROMPT = `Write a tenancy / service agreement as plain text I can paste as a template.

Rules:
- Use {{tenant.name}}, {{tenant.email}}, {{tenant.phone}}, {{tenant.address}}, {{tenant.registration_number}} for Party 1 (my organization).
- Use {{doctor.name}}, {{doctor.email}}, {{doctor.phone}}, {{doctor.address}} for Party 2 (the doctor).
- Use {{date}} for today. Any other fill-in (rent, dates, amounts) stays as {{CAPITAL_WORDS}} — I will fill those in the editor.
- Use {{signature.tenant}} where my organization (Party 1) signs, and {{signature.doctor}} where the doctor (Party 2) signs.
- Keep headings with # and plain paragraphs.

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
  // Detected-field inputs are shown after "Detect required fields" (auto-shown
  // when editing a template that already has saved values).
  const [showFields, setShowFields] = useState(false);
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
      const fieldValues = Object.entries(editor.fieldValues || {})
        .filter(([, v]) => String(v).trim() !== "")
        .map(([tag, value]) => ({ tag, value: String(value) }));
      const payload = {
        name: editor.name.trim(),
        bodyText: editor.bodyText || "",
        partyFields: editor.partyFields,
        fieldValues,
      };
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

  const previewCtx = { ...tenantPreviewContext(org), ...(editor.fieldValues || {}) };
  const previewBody = resolvePlaceholdersClient(editor.bodyText || "", previewCtx);
  const tagScan = scanBodyTags(editor.bodyText || "");

  // {{signature.tenant}} → the saved Party 1 signature image (or a note when
  // missing); {{signature.doctor}} stays a visible marker — the doctor signs
  // on their own link.
  const tenantSigHtml = SAFE_SIG_RE.test(String(org?.signature || ""))
    ? `<img class="templateSignature" src="${org.signature}" alt="Party 1 signature" />`
    : `<span class="templateSignatureMissing">Party 1 signature not saved yet — add it via the pencil icon above.</span>`;
  const doctorSigHtml = `<span class="templateSignaturePending">Party 2 signature — signed when the doctor opens the link.</span>`;
  const previewHtml = sanitizeHtml(textToStructuredHtml(previewBody))
    .replace(/{{\s*signature\.tenant\s*}}/gi, () => tenantSigHtml)
    .replace(/{{\s*signature\.(doctor|opening|closing)\s*}}/gi, () => doctorSigHtml);

  // "+ Add Template": blank template in the popup editor.
  const addTemplate = () => {
    setEditor(EMPTY_EDITOR);
    setBanner("");
    setShowFields(false);
    setShowEditor(true);
  };

  const editTemplate = (t) => {
    setBanner("");
    const fieldValues = {};
    for (const pair of t.fieldValues || []) {
      fieldValues[String(pair.tag || "").toLowerCase()] = String(pair.value || "");
    }
    setEditor({
      _id: String(t._id),
      name: t.name || "",
      partyFields: t.partyFields || [],
      bodyText: t.bodyText || "",
      fieldValues,
    });
    // Saved values mean fields were already detected — show the inputs.
    setShowFields(Object.keys(fieldValues).length > 0);
    setShowEditor(true);
  };

  const detectFields = () => {
    setShowFields(true);
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
          <div className="schema-forms-module-grid" style={{ marginTop: "1rem" }}>
            {templates.map((t) => {
              const customCount = (t.fieldValues || []).length;
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
                    {customCount ? `${customCount} filled field${customCount === 1 ? "" : "s"} · ` : ""}updated{" "}
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

          <div className="adminRow" style={{ marginTop: 8, gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={detectFields}>
              Detect required fields
            </button>
            {tagScan.unknown.length ? (
              <span className="doc-form-note" style={{ margin: 0 }}>
                {tagScan.unknown.length} field{tagScan.unknown.length === 1 ? "" : "s"} need{tagScan.unknown.length === 1 ? "s" : ""} a value
              </span>
            ) : null}
          </div>

          {showFields ? (
            <div className="detectedFields">
              {tagScan.unknown.length ? (
                tagScan.unknown.map((tag) => (
                  <div className="field" key={tag}>
                    <label htmlFor={`field-value-${tag}`}>{KNOWN_LABELS[tag] || tag}</label>
                    <input
                      id={`field-value-${tag}`}
                      value={editor.fieldValues[tag] || ""}
                      onChange={(e) =>
                        setEditor((p) => ({ ...p, fieldValues: { ...p.fieldValues, [tag]: e.target.value } }))
                      }
                      placeholder={`Value for {{${tag}}}`}
                    />
                  </div>
                ))
              ) : (
                <p className="doc-form-note" style={{ margin: 0 }}>
                  No unknown fields — everything resolves from organization data or the doctor's profile.
                </p>
              )}
              {tagScan.party2.length ? (
                <p className="doc-form-note" style={{ margin: 0 }}>
                  Party 2 fields ({tagScan.party2.map((t) => `{{${t}}}`).join(", ")}) fill in when the doctor
                  opens the link — nothing to enter here.
                </p>
              ) : null}
              {tagScan.signature.includes("signature.tenant") && !org?.signature ? (
                <p className="fieldError" style={{ margin: 0 }}>
                  This template needs your organization's Party 1 signature — save it first via the pencil
                  icon in the header, or forms can't be assigned until then.
                </p>
              ) : null}
            </div>
          ) : null}

          <h3>Preview</h3>
          <div className="agreementPreview">
            <div className="templateAgreement">
              <div className="templateBody">
                {previewBody.trim() ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
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
