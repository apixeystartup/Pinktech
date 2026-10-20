import { useMemo, useRef, useState } from "react";
import {
  submitSchemaForm,
  waitForSchemaFormSubmission,
  resolveSchemaFormAssetUrl,
} from "../../lib/schemaFormsPublic";
import { sanitizeHtml } from "../../lib/agreementFormatter";
import PdfFieldCanvas from "../sign/PdfFieldCanvas";
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

// The signature-position marker lets the signature pad render inside the agreement.
function splitAtSignatureMarker(html) {
  const re = /{{\s*signature\.opening\s*}}/i;
  const text = String(html || "");
  const match = text.match(re);
  if (!match || match.index === undefined) return null;
  return { before: text.slice(0, match.index), after: text.slice(match.index + match[0].length) };
}

function AgreementHtml({ html }) {
  return <div className="agreementText" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

function PreSignatureBlock({ mode, setMode, signatureDataUrl, setSignatureDataUrl }) {
  return (
    <>
      <div className="signatureModeToggle">
        <button type="button" className={`sigModeBtn ${mode === "upload" ? "active" : ""}`} onClick={() => setMode("upload")}>Upload Image</button>
        <button type="button" className={`sigModeBtn ${mode === "draw" ? "active" : ""}`} onClick={() => setMode("draw")}>Draw Signature</button>
      </div>
      {mode === "upload" ? (
        <>
          <label htmlFor="pre-signature">Upload Signature Image</label>
          <input
            id="pre-signature"
            className="inputElevated inputFile"
            type="file"
            accept="image/*"
            onChange={(e) => fileToDataUrl(e.target.files?.[0], setSignatureDataUrl)}
          />
        </>
      ) : (
        <SignaturePad onSign={setSignatureDataUrl} />
      )}
      {signatureDataUrl && (
        <div className="signaturePreview">
          <img src={signatureDataUrl} alt="Signature preview" style={{ maxHeight: 60, border: "1px solid #ddd", borderRadius: 4, marginTop: 4 }} />
          <button type="button" className="smallBtn" style={{ marginLeft: 8 }} onClick={() => setSignatureDataUrl("")}>Remove</button>
        </div>
      )}
    </>
  );
}

function DynamicFormRenderer({
  moduleDoc,
  dispatchToken = "",
  templateAgreement = null,
  openingAgreement = null,
}) {
  const fields = moduleDoc.schema?.fields || [];
  const settings = moduleDoc.schema?.settings || {};
  const [values, setValues] = useState(() => buildInitialValues(fields));
  const [openingFields, setOpeningFields] = useState(() => openingAgreement?.fields || []);
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const submittingRef = useRef(false);
  const [phase, setPhase] = useState("pre");
  const [preAccepted, setPreAccepted] = useState(false);
  const [preSignatureDataUrl, setPreSignatureDataUrl] = useState("");
  const [signatureTarget, setSignatureTarget] = useState(null);
  const [preSigMode, setPreSigMode] = useState("upload");
  const [pdfUrl, setPdfUrl] = useState("");
  const honeypotName = useMemo(() => "website", []);
  const preAgreementText =
    settings.preAgreementText || settings.postAgreementText || "I agree not to disclose any data shared during this process.";
  // Dispatches carry a frozen copy of the agreement as it was when assigned.
  const openingAgreementHtml = templateAgreement ? templateAgreement.html || "" : "";

  const editableTemplateValues = (agreementFields) =>
    Object.fromEntries(
      agreementFields
        .filter((field) => String(field.tag || "").toLowerCase().startsWith("custom."))
        .filter((field) => ["TEXT", "DATE", "CHECKBOX"].includes(String(field.type || "").toUpperCase()))
        .map((field) => [String(field._id || field.id), field.value ?? ""]),
    );

  const signerFieldIds = (agreementFields) =>
    new Set(
      agreementFields
        .filter((field) => {
          const tag = String(field.tag || "").toLowerCase();
          const type = String(field.type || "").toUpperCase();
          return (
            (tag.startsWith("custom.") && ["TEXT", "DATE", "CHECKBOX"].includes(type)) ||
            (["SIGNATURE", "INITIALS"].includes(type) && tag !== "signature.tenant")
          );
        })
        .map((field) => String(field._id || field.id)),
    );

  const updateAgreementField = (fieldId, patch) => {
    setOpeningFields((current) =>
      current.map((field) =>
        String(field._id || field.id) === String(fieldId) ? { ...field, ...patch } : field,
      ),
    );
  };

  const setAgreementSignature = (signature) => {
    setPreSignatureDataUrl(signature);
    setOpeningFields((current) =>
      current.map((field) => {
        const tag = String(field.tag || "").toLowerCase();
        const type = String(field.type || "").toUpperCase();
        return ["SIGNATURE", "INITIALS"].includes(type) && tag !== "signature.tenant"
          ? { ...field, value: signature }
          : field;
      }),
    );
  };

  const agreementIsReady = () => {
    if (!preAccepted) return { ready: false, message: "Please accept the agreement before continuing." };
    if (!preSignatureDataUrl) return { ready: false, message: "Please sign the agreement before continuing." };
    const missing = openingFields.find((field) => {
      const tag = String(field.tag || "").toLowerCase();
      const type = String(field.type || "").toUpperCase();
      if (!tag.startsWith("custom.") || !["TEXT", "DATE", "CHECKBOX"].includes(type)) return false;
      return !String(field.value || "").trim();
    });
    if (missing) return { ready: false, message: `Complete the Party 2 field "${missing.label || missing.tag}" before continuing.` };
    return { ready: true, message: "" };
  };

  const validateFormFields = () => {
    const localErrors = {};
    fields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.key])) {
        localErrors[field.key] = "This field is required.";
      }
    });
    setFieldErrors(localErrors);
    return Object.keys(localErrors).length === 0;
  };

  const setValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (phase !== "form") return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFieldErrors({});
    setStatusMessage("");

    if (!validateFormFields()) {
      submittingRef.current = false;
      return;
    }
    const readiness = agreementIsReady();
    if (!readiness.ready) {
      setStatusType("error");
      setStatusMessage(readiness.message);
      submittingRef.current = false;
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const submissionPayload = {
        moduleId: moduleDoc._id,
        ...(dispatchToken ? { dispatchToken } : {}),
        data: values,
        agreements: {
          pre: {
            accepted: true,
            text: preAgreementText,
            signatureDataUrl: preSignatureDataUrl,
            templateFieldValues: editableTemplateValues(openingFields),
            acceptedAt: now,
          },
        },
        [honeypotName]: "",
      };
      let result;
      try {
        result = await submitSchemaForm(submissionPayload);
      } catch (error) {
        if (!dispatchToken || error.payload) throw error;
        setIsPreparingPdf(true);
        setStatusType("success");
        setStatusMessage("Your response was received. Preparing your PDF...");
        result = await waitForSchemaFormSubmission(dispatchToken);
      }
      if (!result.pdfDownloadUrl) {
        setIsPreparingPdf(true);
        setStatusType("success");
        setStatusMessage("Your response was received. Preparing your PDF...");
        result = await waitForSchemaFormSubmission(
          dispatchToken || result.id,
          (status) => {
            if (status.pdfStatus === "processing") {
              setStatusMessage("Your response was received. Preparing your PDF...");
            }
          },
        );
      }
      setPdfUrl(result.pdfDownloadUrl || "");
      setStatusType("success");
      setStatusMessage(settings.successMessage || result.message || "Submission successful.");
      setPhase("done");
    } catch (error) {
      const apiFieldErrors = error.payload?.fieldErrors;
      if (apiFieldErrors) setFieldErrors(apiFieldErrors);
      setStatusType("error");
      setStatusMessage(error.message || "Failed to submit.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setIsPreparingPdf(false);
    }
  };

  const pdfHref = resolveSchemaFormAssetUrl(pdfUrl);

  return (
    <div>
      {phase === "pre" && (
        <section className="agreementCard glassPanel">
          <h2>{openingAgreement?.name || (templateAgreement ? templateAgreement.name || "Agreement" : "Opening Agreement")}</h2>
          {openingAgreement ? (
            <>
              <PdfFieldCanvas
                pdfUrl={resolveSchemaFormAssetUrl(openingAgreement.documentUrl)}
                fields={openingFields}
                mode="sign"
                signerFieldIds={signerFieldIds(openingFields)}
                onChange={updateAgreementField}
                onSignatureRequest={(fieldId) => setSignatureTarget({ fieldId })}
                fitToContainer
              />
              <button type="button" className="smallBtn" onClick={() => setSignatureTarget({})}>
                {preSignatureDataUrl ? "Redraw signature" : "Draw Party 2 signature"}
              </button>
            </>
          ) : splitAtSignatureMarker(openingAgreementHtml || preAgreementText) ? (
            <>
              <AgreementHtml
                html={splitAtSignatureMarker(openingAgreementHtml || preAgreementText).before}
              />
              <PreSignatureBlock mode={preSigMode} setMode={setPreSigMode} signatureDataUrl={preSignatureDataUrl} setSignatureDataUrl={setPreSignatureDataUrl} />
              <AgreementHtml
                html={splitAtSignatureMarker(openingAgreementHtml || preAgreementText).after}
              />
            </>
          ) : (
            <>
              <AgreementHtml html={openingAgreementHtml || preAgreementText} />
              <PreSignatureBlock mode={preSigMode} setMode={setPreSigMode} signatureDataUrl={preSignatureDataUrl} setSignatureDataUrl={setPreSignatureDataUrl} />
            </>
          )}
          <label className="optionLabel">
            <input
              className="inputGlossy"
              type="checkbox"
              checked={preAccepted}
              onChange={(e) => setPreAccepted(e.target.checked)}
            />
            I agree
          </label>
          <button
            type="button"
            className="ioButton"
            onClick={() => {
              if (!preAccepted || !preSignatureDataUrl) {
                setStatusType("error");
                setStatusMessage("Please accept the agreement and provide your signature.");
                return;
              }
              setStatusMessage("");
              const readiness = agreementIsReady();
              if (!readiness.ready) {
                setStatusType("error");
                setStatusMessage(readiness.message);
                return;
              }
              if (!window.confirm("Confirm that you have completed and checked all Party 2 fields in the opening agreement.")) return;
              setPhase("form");
            }}
          >
            Continue to form
          </button>
        </section>
      )}

      {phase === "form" && (
        <form onSubmit={onSubmit}>
          <div className="grid formSurface">
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
            <div className="full">
              <button type="submit" className="ioButton" disabled={isSubmitting}>
                {isPreparingPdf ? "Preparing PDF…" : isSubmitting ? "Submitting…" : settings.submitLabel || "Submit"}
              </button>
            </div>
          </div>
        </form>
      )}

      {phase === "done" ? (
        <div className="alert alert--success full">{statusMessage}</div>
      ) : null}

      {statusMessage && phase !== "done" ? (
        <div className={statusType === "error" ? "alert alert--error full" : "alert alert--success full"}>
          {statusMessage}
        </div>
      ) : null}
      {signatureTarget ? (
        <div className="agreementCard glassPanel">
          <h3>Draw your signature</h3>
          <SignaturePad
            onSign={(signature) => {
              setAgreementSignature(signature);
              if (signatureTarget.fieldId) {
                updateAgreementField(signatureTarget.fieldId, { value: signature });
              }
              setSignatureTarget(null);
            }}
          />
          <button type="button" className="smallBtn" onClick={() => setSignatureTarget(null)}>Cancel</button>
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
