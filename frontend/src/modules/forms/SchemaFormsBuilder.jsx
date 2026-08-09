/* eslint-disable react-hooks/set-state-in-effect -- data loading matches AdminPage pattern */
import { useEffect, useState } from "react";
import {
  createModule,
  getFormResponses,
  getModules,
  seedClientForm,
  updateModule,
} from "../../lib/schemaFormsApi";
import api from "../../lib/api";
import { resolveSchemaFormAssetUrl } from "../../lib/schemaFormsPublic";
import "../../styles/schema-forms.css";

const QUESTION_TYPE_OPTIONS = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Paragraph" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Multiple choice" },
  { value: "checkbox", label: "Checkboxes" },
  { value: "file", label: "File upload" },
];

const starterSchema = {
  name: "New Form",
  moduleType: "FORM",
  isPublished: true,
  schema: {
    settings: {
      description: "Please fill this form.",
      submitLabel: "Submit",
      successMessage: "Thanks. Your response has been received.",
      allowDraft: false,
    },
    fields: [
      { key: "fullName", label: "Full Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
    ],
  },
};

function toKey(label, fallbackIndex = 0) {
  const clean = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("_");
  if (clean) return clean;
  return `question_${fallbackIndex + 1}`;
}

function makeBuilderId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `qb_${crypto.randomUUID()}`;
  return `qb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function ensureUniqueFieldKey(baseKey, fieldList, ownIndex) {
  let key = baseKey || `question_${ownIndex + 1}`;
  let n = 2;
  while (fieldList.some((f, i) => i !== ownIndex && f.key === key)) {
    key = `${baseKey || "question"}_${n++}`;
  }
  return key;
}

function normalizeField(field, index) {
  const type = field?.type || "text";
  const normalized = {
    _builderId: field?._builderId || makeBuilderId(),
    key: field?.key || toKey(field?.label || `Question ${index + 1}`, index),
    label: field?.label || `Question ${index + 1}`,
    type,
    required: Boolean(field?.required),
    placeholder: field?.placeholder || "",
    ui: {
      width: field?.ui?.width === "half" ? "half" : "full",
    },
  };
  if (type === "select" || type === "radio" || type === "checkbox") {
    normalized.options = Array.isArray(field?.options) && field.options.length ? field.options : ["Option 1"];
  }
  if (type === "file") {
    normalized.validations = {
      allowedFileTypes: Array.isArray(field?.validations?.allowedFileTypes)
        ? field.validations.allowedFileTypes
        : ["image/*", "application/pdf"],
    };
  }
  return normalized;
}

function stripBuilderMetaForApi(doc) {
  const fields = doc.schema.fields.map((field) => {
    const copy = { ...field };
    delete copy._builderId;
    return copy;
  });
  return { ...doc, schema: { ...doc.schema, fields } };
}

function normalizeModuleDoc(moduleDoc) {
  const raw = moduleDoc || starterSchema;
  return {
    ...raw,
    moduleType: "FORM",
    schema: {
      settings: {
        description: raw.schema?.settings?.description || "",
        submitLabel: raw.schema?.settings?.submitLabel || "Submit",
        successMessage: raw.schema?.settings?.successMessage || "Thanks. Your response has been received.",
        allowDraft: Boolean(raw.schema?.settings?.allowDraft),
      },
      fields: Array.isArray(raw.schema?.fields) ? raw.schema.fields.map(normalizeField) : [],
    },
  };
}

function SchemaFormsBuilder() {
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [builderState, setBuilderState] = useState(normalizeModuleDoc(starterSchema));
  const [schemaText, setSchemaText] = useState(JSON.stringify(normalizeModuleDoc(starterSchema), null, 2));
  const [showRawJson, setShowRawJson] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [responses, setResponses] = useState([]);

  const fields = builderState.schema?.fields || [];

  function syncTextWithBuilder(nextBuilderState) {
    setBuilderState(nextBuilderState);
    setSchemaText(JSON.stringify(nextBuilderState, null, 2));
  }

  async function refreshModules(targetId = "") {
    const data = await getModules();
    setModules(data);
    if (targetId) {
      setSelectedId(targetId);
      const selected = data.find((item) => item._id === targetId);
      const normalized = normalizeModuleDoc(selected || starterSchema);
      syncTextWithBuilder(normalized);
      return;
    }
    if (!data.length) {
      setSelectedId("");
      syncTextWithBuilder(normalizeModuleDoc(starterSchema));
      return;
    }
    if (!selectedId) {
      setSelectedId(data[0]._id);
      syncTextWithBuilder(normalizeModuleDoc(data[0]));
    }
  }

  async function refreshResponses(moduleId) {
    if (!moduleId) {
      setResponses([]);
      return;
    }
    const data = await getFormResponses(moduleId);
    setResponses(data);
  }

  useEffect(() => {
    refreshModules().catch((err) => setStatus({ type: "error", message: err.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshResponses(selectedId).catch((err) => setStatus({ type: "error", message: err.message }));
  }, [selectedId]);

  function onChangeModule(id) {
    setSelectedId(id);
    if (!id) {
      syncTextWithBuilder(normalizeModuleDoc(starterSchema));
      return;
    }
    const selected = modules.find((item) => item._id === id);
    syncTextWithBuilder(normalizeModuleDoc(selected || starterSchema));
    refreshResponses(id).catch((err) => setStatus({ type: "error", message: err.message }));
  }

  function updateRootField(key, value) {
    const next = { ...builderState, [key]: value };
    syncTextWithBuilder(next);
  }

  function updateSetting(key, value) {
    const next = {
      ...builderState,
      schema: {
        ...builderState.schema,
        settings: {
          ...builderState.schema.settings,
          [key]: value,
        },
      },
    };
    syncTextWithBuilder(next);
  }

  function addQuestion() {
    const nextFields = [
      ...fields,
      normalizeField({ label: `Question ${fields.length + 1}`, type: "text", required: false }, fields.length),
    ];
    syncTextWithBuilder({ ...builderState, schema: { ...builderState.schema, fields: nextFields } });
  }

  function removeQuestion(index) {
    const nextFields = fields.filter((_, i) => i !== index);
    syncTextWithBuilder({ ...builderState, schema: { ...builderState.schema, fields: nextFields } });
  }

  function duplicateQuestion(index) {
    const question = fields[index];
    const cloneSource = { ...question };
    delete cloneSource._builderId;
    const clone = normalizeField(
      {
        ...cloneSource,
        label: `${question.label || `Question ${index + 1}`} Copy`,
        key: toKey(`${question.label || `Question ${index + 1}`} Copy`, fields.length),
      },
      index + 1,
    );
    const nextFields = [...fields.slice(0, index + 1), clone, ...fields.slice(index + 1)];
    syncTextWithBuilder({ ...builderState, schema: { ...builderState.schema, fields: nextFields } });
  }

  function moveQuestion(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const nextFields = [...fields];
    const [picked] = nextFields.splice(index, 1);
    nextFields.splice(target, 0, picked);
    syncTextWithBuilder({ ...builderState, schema: { ...builderState.schema, fields: nextFields } });
  }

  function updateQuestion(index, patch) {
    const current = fields[index];
    const merged = normalizeField({ ...current, ...patch }, index);
    const nextFields = fields.map((item, i) => (i === index ? merged : item));
    syncTextWithBuilder({ ...builderState, schema: { ...builderState.schema, fields: nextFields } });
  }

  function updateOption(questionIndex, optionIndex, value) {
    const question = fields[questionIndex];
    const options = [...(question.options || [])];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  }

  function addOption(questionIndex) {
    const question = fields[questionIndex];
    const nextOptionNumber = (question.options || []).length + 1;
    updateQuestion(questionIndex, { options: [...(question.options || []), `Option ${nextOptionNumber}`] });
  }

  function removeOption(questionIndex, optionIndex) {
    const question = fields[questionIndex];
    const options = (question.options || []).filter((_, i) => i !== optionIndex);
    updateQuestion(questionIndex, { options: options.length ? options : ["Option 1"] });
  }

  function onRawJsonChange(value) {
    setSchemaText(value);
    try {
      const parsed = JSON.parse(value);
      setBuilderState(normalizeModuleDoc(parsed));
      setStatus((prev) => (prev.type === "error" ? { type: "", message: "" } : prev));
    } catch {
      // Keep text in sync; save will show error if JSON is invalid.
    }
  }

  async function onSave() {
    try {
      const parsed = stripBuilderMetaForApi(normalizeModuleDoc(JSON.parse(schemaText)));
      const result = parsed._id ? await updateModule(parsed._id, parsed) : await createModule(parsed);
      try {
        await api.post("/kyc/schema-modules/scope", { moduleId: result._id });
      } catch {
        /* not signed in or no form/KYC permission — module stays unscoped */
      }
      setStatus({ type: "success", message: "Form saved successfully." });
      await refreshModules(result._id);
      await refreshResponses(result._id);
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Failed to save form." });
    }
  }

  async function onSeed() {
    try {
      const result = await seedClientForm();
      setStatus({ type: "success", message: result.message || "Seed completed." });
      await refreshModules(result.moduleId);
      await refreshResponses(result.moduleId);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  function publicFormUrl(moduleId) {
    return `${window.location.origin}/public/schema-forms/${moduleId}`;
  }

  async function copyPublicLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ type: "success", message: "Public link copied." });
    } catch {
      setStatus({ type: "error", message: "Unable to copy (clipboard permission)." });
    }
  }

  return (
    <div className="schema-forms">
      <div className="schema-forms__modules-section">
        <h2 className="schema-forms__modules-heading">Form modules</h2>
        <p className="hint schema-forms__modules-lead">
          Each card is a shareable form. Copy the public link or open it in a new tab. Use <strong>Edit</strong> to load it in the builder below.
        </p>
        {!modules.length ? (
          <p className="hint">No saved modules yet. Seed a starter form or save a new one to see cards here.</p>
        ) : (
          <div className="schema-forms-module-grid">
            {modules.map((mod) => {
              const url = publicFormUrl(mod._id);
              const qCount = mod.schema?.fields?.length ?? 0;
              const active = mod._id === selectedId;
              return (
                <article
                  key={mod._id}
                  className={`schema-forms-module-card${active ? " schema-forms-module-card--active" : ""}`}
                >
                  <div className="schema-forms-module-card__head">
                    <h3 className="schema-forms-module-card__title">{mod.name || "Untitled"}</h3>
                    <span
                      className={`schema-forms-module-card__badge${mod.isPublished ? " schema-forms-module-card__badge--live" : ""}`}
                    >
                      {mod.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="schema-forms-module-card__meta">
                    {qCount} question{qCount === 1 ? "" : "s"} · id <code>{String(mod._id).slice(0, 8)}…</code>
                  </p>
                  <p className="schema-forms-module-card__url" title={url}>
                    {url}
                  </p>
                  <div className="schema-forms-module-card__actions">
                    <button type="button" className="ghostBtn miniBtn" onClick={() => copyPublicLink(url)}>
                      Copy link
                    </button>
                    <a className="ioButton ioButton--sm" href={url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    <button type="button" className="ioButton ioButton--sm" onClick={() => onChangeModule(mod._id)}>
                      Edit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="adminTopBar">
        <div className="adminStats">
          <div className="statCard">
            <span>Questions</span>
            <strong>{fields.length}</strong>
          </div>
          <div className="statCard">
            <span>Responses</span>
            <strong>{responses.length}</strong>
          </div>
          <div className="statCard">
            <span>Status</span>
            <strong>{builderState.isPublished ? "Published" : "Draft"}</strong>
          </div>
        </div>
        <div className="adminActions">
          <button type="button" className="ghostBtn" onClick={onSeed}>
            Seed Starter Form
          </button>
          <button type="button" className="ioButton" onClick={onSave}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Save form
          </button>
        </div>
      </div>

      <div className="builderCard">
        <div className="adminRow">
          <h2>Workspace</h2>
          <label className="optionLabel adminInline">
            <input className="inputGlossy" type="checkbox" checked={showRawJson} onChange={(e) => setShowRawJson(e.target.checked)} />
            Raw JSON
          </label>
        </div>
        <label htmlFor="moduleSelect">Existing Forms</label>
        <select id="moduleSelect" value={selectedId} onChange={(e) => onChangeModule(e.target.value)}>
          <option value="">Create new form</option>
          {modules.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        {showRawJson ? <textarea id="moduleJson" rows={14} value={schemaText} onChange={(e) => onRawJsonChange(e.target.value)} /> : null}
      </div>

      <div className="builderCard">
        <h2>Form Setup</h2>
        <label htmlFor="formName">Form Title</label>
        <input id="formName" value={builderState.name || ""} onChange={(e) => updateRootField("name", e.target.value)} />
        <label htmlFor="formDescription">Description</label>
        <textarea
          id="formDescription"
          rows={2}
          value={builderState.schema?.settings?.description || ""}
          onChange={(e) => updateSetting("description", e.target.value)}
        />
        <div className="grid">
          <div className="field">
            <label htmlFor="submitLabel">Submit Button Label</label>
            <input
              id="submitLabel"
              value={builderState.schema?.settings?.submitLabel || ""}
              onChange={(e) => updateSetting("submitLabel", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="isPublished">Publish Form</label>
            <select
              id="isPublished"
              value={String(Boolean(builderState.isPublished))}
              onChange={(e) => updateRootField("isPublished", e.target.value === "true")}
            >
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </select>
          </div>
        </div>
        <label htmlFor="successMessage">Success Message</label>
        <textarea
          id="successMessage"
          rows={2}
          value={builderState.schema?.settings?.successMessage || ""}
          onChange={(e) => updateSetting("successMessage", e.target.value)}
        />
      </div>

      <div className="builderCard">
        <div className="adminRow">
          <h2>Questions</h2>
          <button type="button" className="ioButton ioButton--sm" onClick={addQuestion}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add question
          </button>
        </div>
        {!fields.length ? (
          <div className="emptyBuilder">
            <div className="emptyBuilder__illu" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M14 2v6h6M8 13h8M8 17h6M8 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="emptyBuilder__title">No questions yet</p>
            <p className="emptyBuilder__hint">Use “Add question” above to create fields. You can reorder, duplicate, or remove them anytime.</p>
          </div>
        ) : null}
        {fields.map((field, index) => {
          const supportsOptions = field.type === "select" || field.type === "radio" || field.type === "checkbox";
          const supportsFileTypes = field.type === "file";
          return (
            <div key={field._builderId} className="questionCard">
              <div className="adminRow">
                <strong>Question {index + 1}</strong>
                <div className="questionActions">
                  <button type="button" className="ghostBtn miniBtn" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>
                    Up
                  </button>
                  <button
                    type="button"
                    className="ghostBtn miniBtn"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === fields.length - 1}
                  >
                    Down
                  </button>
                  <button type="button" className="ghostBtn miniBtn" onClick={() => duplicateQuestion(index)}>
                    Duplicate
                  </button>
                  <button type="button" className="dangerBtn miniBtn" onClick={() => removeQuestion(index)}>
                    Remove
                  </button>
                </div>
              </div>
              <label>Question Title</label>
              <input
                className="inputElevated"
                value={field.label || ""}
                onChange={(e) => updateQuestion(index, { label: e.target.value })}
                onBlur={(e) => {
                  const label = e.target.value;
                  const base = toKey(label, index);
                  const listWithLabel = fields.map((f, i) => (i === index ? { ...f, label } : f));
                  const unique = ensureUniqueFieldKey(base, listWithLabel, index);
                  if (unique !== field.key) updateQuestion(index, { key: unique });
                }}
              />
              <p className="fieldKeyHint">
                Field id: <code>{field.key}</code>
              </p>
              <div className="grid">
                <div className="field">
                  <label>Type</label>
                  <select value={field.type} onChange={(e) => updateQuestion(index, { type: e.target.value })}>
                    {QUESTION_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Width</label>
                  <select
                    value={field.ui?.width === "half" ? "half" : "full"}
                    onChange={(e) => updateQuestion(index, { ui: { ...(field.ui || {}), width: e.target.value } })}
                  >
                    <option value="full">Full width</option>
                    <option value="half">Half width</option>
                  </select>
                </div>
              </div>
              <label className="optionLabel adminInline">
                <input
                  className="inputGlossy"
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                />
                Required
              </label>

              {!supportsOptions && !supportsFileTypes ? (
                <>
                  <label>Placeholder</label>
                  <input value={field.placeholder || ""} onChange={(e) => updateQuestion(index, { placeholder: e.target.value })} />
                </>
              ) : null}

              {supportsOptions ? (
                <div>
                  <label>Options</label>
                  {(field.options || []).map((opt, optIndex) => (
                    <div key={`${field._builderId}-opt-${optIndex}`} className="adminRow">
                      <input value={opt} onChange={(e) => updateOption(index, optIndex, e.target.value)} />
                      <button type="button" className="dangerBtn" onClick={() => removeOption(index, optIndex)}>
                        Delete
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOption(index)}>
                    + Add Option
                  </button>
                </div>
              ) : null}

              {supportsFileTypes ? (
                <div>
                  <label>Allowed file types (comma separated)</label>
                  <input
                    value={(field.validations?.allowedFileTypes || []).join(", ")}
                    onChange={(e) => {
                      const allowedFileTypes = e.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                      updateQuestion(index, { validations: { ...field.validations, allowedFileTypes } });
                    }}
                    placeholder="image/*,application/pdf"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {status.message ? (
        <div className={status.type === "error" ? "alert alert--error" : "alert alert--success"}>{status.message}</div>
      ) : null}
      <h2 className="schema-forms__responses-title">Responses</h2>
      {!selectedId ? <p className="hint">Select a form to view responses.</p> : null}
      {selectedId && !responses.length ? <p className="hint">No responses yet.</p> : null}
      {responses.length ? (
        <div className="tableWrap">
          <table className="responseTable">
            <thead>
              <tr>
                <th>Submitted At</th>
                <th>Fields</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {responses.map((item) => (
                <tr key={item._id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{Object.keys(item.data || {}).join(", ")}</td>
                  <td>
                    {item.pdfDownloadUrl ? (
                      <a className="link" href={resolveSchemaFormAssetUrl(item.pdfDownloadUrl)} target="_blank" rel="noreferrer">
                        Download PDF
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default SchemaFormsBuilder;
