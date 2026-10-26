import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import useAuth from "../../hooks/useAuth";
import { fetchTemplates, templatesKey } from "./templatesQuery";
import { extractTemplateText, fileToAgreementHtml, sanitizeHtml, textToStructuredHtml } from "../../lib/agreementFormatter";
import { PLACEHOLDER_TAGS, resolvePlaceholdersClient } from "../../lib/placeholders";
import SignatureTemplatesTab from "./SignatureTemplatesTab.jsx";
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

function TemplatesTab({ org, toolbar, onDesigningChange }) {
  const { tenantContextId, isSuperAdmin } = useAuth();
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [showEditor, setShowEditor] = useState(false);
  const [templateMode, setTemplateMode] = useState("text");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");
  const [uploading, setUploading] = useState(false);
  // Detected-field inputs are shown after "Detect required fields" (auto-shown
  // when editing a template that already has saved values).
  const [showFields, setShowFields] = useState(false);
  const bodyRef = useRef(null);
  const fileRef = useRef(null);

  const queryClient = useQueryClient();
  // Super admin designs per tenant via the header override, so templates follow
  // tenantKey. Cached data renders immediately on tab switches/remounts and
  // revalidates in the background instead of blocking on a fresh request.
  const tenantKey = String(tenantContextId || "");
  const templatesQuery = useQuery({
    queryKey: templatesKey(tenantKey),
    queryFn: fetchTemplates,
    staleTime: 60000,
  });
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];
  const templatesLoading = templatesQuery.isPending;
  const queryError = templatesQuery.isError ? getErrorMessage(templatesQuery.error) : "";

  const reloadTemplates = () => queryClient.invalidateQueries({ queryKey: templatesKey(tenantKey) });

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
      await reloadTemplates();
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
      await reloadTemplates();
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
    <SignatureTemplatesTab
      org={org}
      toolbar={toolbar}
      onDesigningChange={onDesigningChange}
    />
  );
}

export default TemplatesTab;
