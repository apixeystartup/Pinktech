import { useMemo, useState } from "react";
import { submitSchemaForm, resolveSchemaFormAssetUrl } from "../../lib/schemaFormsPublic";
import { sanitizeHtml } from "../../lib/agreementFormatter";
import SignaturePad from "./SignaturePad";

function isEmptyValue(value) {
  return value === "" || value === null || value === undefined || (Array.isArray(value) && !value.length);
}

function buildInitialValues(fields) {
  const initial = {};
  fields.forEach((field) => {
    if (field.type === "checkbox") initial[field.key] = [];
    else initial[field.key] = "";
  });
  return initial;
}

function fileToDataUrl(file, onDone) {
  if (!file) {
    onDone("");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result || ""));
  reader.readAsDataURL(file);
}

function DynamicFormRenderer({ moduleDoc, dispatchToken = "" }) {
  const fields = moduleDoc.schema?.fields || [];
  const settings = moduleDoc.schema?.settings || {};
  const [values, setValues] = useState(() => buildInitialValues(fields));
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState("pre");
  const [preAccepted, setPreAccepted] = useState(false);
  const [postAccepted, setPostAccepted] = useState(false);
  const [preSignatureDataUrl, setPreSignatureDataUrl] = useState("");
  const [postSignatureDataUrl, setPostSignatureDataUrl] = useState("");
  const [preSigMode, setPreSigMode] = useState("upload");
  const [postSigMode, setPostSigMode] = useState("upload");
  const [pdfUrl, setPdfUrl] = useState("");
  const honeypotName = useMemo(() => "website", []);
  const preAgreementText =
    settings.preAgreementText || "I agree not to disclose any data shared during this process.";
  const postAgreementText =
    settings.postAgreementText ||
    "I confirm submitted information is accurate and I will not disclose sensitive form data.";

  const setValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFieldErrors({});
    setStatusMessage("");

    const localErrors = {};
    fields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.key])) {
        localErrors[field.key] = "This field is required.";
      }
    });

    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      return;
    }
    if (!postAccepted || !postSignatureDataUrl) {
      setStatusType("error");
      setStatusMessage("Please accept and sign the closing agreement.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const result = await submitSchemaForm({
        moduleId: moduleDoc._id,
        ...(dispatchToken ? { dispatchToken } : {}),
        data: values,
        agreements: {
          pre: {
            accepted: true,
            text: preAgreementText,
            signatureDataUrl: preSignatureDataUrl,
            acceptedAt: now,
          },
          post: {
            accepted: true,
            text: postAgreementText,
            signatureDataUrl: postSignatureDataUrl,
            acceptedAt: now,
          },
        },
        [honeypotName]: "",
      });
      setValues(buildInitialValues(fields));
      setPostAccepted(false);
      setPostSignatureDataUrl("");
      setPdfUrl(result.pdfDownloadUrl || "");
      setStatusType("success");
      setStatusMessage(result.message || settings.successMessage || "Submitted.");
    } catch (error) {
      const apiFieldErrors = error.payload?.fieldErrors;
      if (apiFieldErrors) setFieldErrors(apiFieldErrors);
      setStatusType("error");
      setStatusMessage(error.message || "Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pdfHref = resolveSchemaFormAssetUrl(pdfUrl);

  return (
    <div>
      {phase === "pre" ? (
        <section className="agreementCard glassPanel">
          <h2>Opening Agreement</h2>
          <div className="agreementText" dangerouslySetInnerHTML={{ __html: sanitizeHtml(preAgreementText) }} />
          <label className="optionLabel">
            <input
              className="inputGlossy"
              type="checkbox"
              checked={preAccepted}
              onChange={(e) => setPreAccepted(e.target.checked)}
            />
            I agree
          </label>
          <div className="signatureModeToggle">
            <button type="button" className={`sigModeBtn ${preSigMode === "upload" ? "active" : ""}`} onClick={() => setPreSigMode("upload")}>Upload Image</button>
            <button type="button" className={`sigModeBtn ${preSigMode === "draw" ? "active" : ""}`} onClick={() => setPreSigMode("draw")}>Draw Signature</button>
          </div>
          {preSigMode === "upload" ? (
            <>
              <label htmlFor="pre-signature">Upload Signature Image</label>
              <input
                id="pre-signature"
                className="inputElevated inputFile"
                type="file"
                accept="image/*"
                onChange={(e) => fileToDataUrl(e.target.files?.[0], setPreSignatureDataUrl)}
              />
            </>
          ) : (
            <SignaturePad onSign={setPreSignatureDataUrl} />
          )}
          {preSignatureDataUrl && (
            <div className="signaturePreview">
              <img src={preSignatureDataUrl} alt="Signature preview" style={{ maxHeight: 60, border: "1px solid #ddd", borderRadius: 4, marginTop: 4 }} />
              <button type="button" className="smallBtn" style={{ marginLeft: 8 }} onClick={() => setPreSignatureDataUrl("")}>Remove</button>
            </div>
          )}
          <button
            type="button"
            className="ioButton"
            onClick={() => {
              if (!preAccepted || !preSignatureDataUrl) {
                setStatusType("error");
                setStatusMessage("Please accept agreement and upload signature.");
                return;
              }
              setStatusMessage("");
              setPhase("form");
            }}
          >
            Continue to form
          </button>
        </section>
      ) : null}

      {phase === "form" ? (
        <form className="grid formSurface" onSubmit={onSubmit}>
          {fields.map((field) => (
            <div
              key={field.key}
              className={field.ui?.width === "half" ? "field formFieldWrap" : "field full formFieldWrap"}
            >
              <label htmlFor={field.key}>
                {field.label}
                {field.required ? <span className="reqDot">*</span> : null}
              </label>
              <FieldInput field={field} value={values[field.key]} onChange={(value) => setValue(field.key, value)} />
              {fieldErrors[field.key] ? <div className="fieldError">{fieldErrors[field.key]}</div> : null}
            </div>
          ))}

          <input type="text" name={honeypotName} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
          <div className="full agreementCard glassPanel">
            <h2>Closing Agreement</h2>
            <div className="agreementText" dangerouslySetInnerHTML={{ __html: sanitizeHtml(postAgreementText) }} />
            <label className="optionLabel">
              <input
                className="inputGlossy"
                type="checkbox"
                checked={postAccepted}
                onChange={(e) => setPostAccepted(e.target.checked)}
              />
              I agree
            </label>
            <div className="signatureModeToggle">
              <button type="button" className={`sigModeBtn ${postSigMode === "upload" ? "active" : ""}`} onClick={() => setPostSigMode("upload")}>Upload Image</button>
              <button type="button" className={`sigModeBtn ${postSigMode === "draw" ? "active" : ""}`} onClick={() => setPostSigMode("draw")}>Draw Signature</button>
            </div>
            {postSigMode === "upload" ? (
              <>
                <label htmlFor="post-signature">Upload Signature Image</label>
                <input
                  id="post-signature"
                  className="inputElevated inputFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => fileToDataUrl(e.target.files?.[0], setPostSignatureDataUrl)}
                />
              </>
            ) : (
              <SignaturePad onSign={setPostSignatureDataUrl} />
            )}
            {postSignatureDataUrl && (
              <div className="signaturePreview">
                <img src={postSignatureDataUrl} alt="Signature preview" style={{ maxHeight: 60, border: "1px solid #ddd", borderRadius: 4, marginTop: 4 }} />
                <button type="button" className="smallBtn" style={{ marginLeft: 8 }} onClick={() => setPostSignatureDataUrl("")}>Remove</button>
              </div>
            )}
          </div>
          <button type="submit" className="ioButton full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : settings.submitLabel || "Submit"}
          </button>
        </form>
      ) : null}

      {statusMessage ? (
        <div className={statusType === "error" ? "alert alert--error full" : "alert alert--success full"}>
          {statusMessage}
        </div>
      ) : null}
      {pdfHref ? (
        <p className="hint">
          Submission PDF:{" "}
          <a className="link" href={pdfHref} target="_blank" rel="noreferrer">
            Download
          </a>
        </p>
      ) : null}
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  if (field.type === "textarea") {
    return (
      <textarea
        className="inputElevated"
        id={field.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ""}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select className="inputElevated" id={field.key} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select...</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="optionGroup">
        {(field.options || []).map((opt) => (
          <label key={opt} className="optionLabel optionPill">
            <input
              className="inputRadio"
              type="radio"
              name={field.key}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "checkbox") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="optionGroup">
        {(field.options || []).map((opt) => (
          <label key={opt} className="optionLabel optionPill">
            <input
              className="inputGlossy"
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, opt]);
                else onChange(selected.filter((item) => item !== opt));
              }}
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <input
        className="inputElevated inputFile"
        id={field.key}
        type="file"
        accept={field.validations?.allowedFileTypes?.join(",") || ""}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return onChange("");
          onChange({ name: file.name, size: file.size, type: file.type });
        }}
      />
    );
  }

  const htmlType = field.type === "phone" ? "tel" : field.type === "textarea" ? "text" : field.type;
  return (
    <input
      className="inputElevated"
      id={field.key}
      type={htmlType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ""}
    />
  );
}

export default DynamicFormRenderer;
