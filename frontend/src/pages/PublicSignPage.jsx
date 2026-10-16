import { useCallback, useEffect, useRef, useState } from "react";
import PdfFieldCanvas from "../components/sign/PdfFieldCanvas";
import SignaturePad from "../components/schema-forms/SignaturePad";
import { getApiV1Base } from "../lib/schemaFormsPublic";

function apiBase() { return getApiV1Base(); }

async function ceremonyGet(token) {
  const res = await fetch(`${apiBase()}/public/sign/${token}`, { headers: { Accept: "application/json" } });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, text: JSON.stringify(data) };
}

async function ceremonyDoc(token, docId) {
  const res = await fetch(`${apiBase()}/public/sign/${token}/document/${docId}`);
  if (!res.ok) return null;
  return res.blob();
}

async function ceremonySign(token, body) {
  const res = await fetch(`${apiBase()}/public/sign/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, text: JSON.stringify(data) };
}

async function ceremonyDecline(token, body) {
  const res = await fetch(`${apiBase()}/public/sign/${token}/decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, text: JSON.stringify(data) };
}

export default function PublicSignPage() {
  // token comes from route param — read from pathname
  const token = (window.location.pathname.split("/").filter(Boolean)[1] || "").trim();

  const [state, setState] = useState("loading"); // loading | ready | done | declined | error
  const [info, setInfo] = useState(null);
  const [fields, setFields] = useState([]);
  const [docUrl, setDocUrl] = useState("");
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Read token from possible react-router props? This page is rendered route element.
  // We'll derive from window path (works for /sign/:token).
  useEffect(() => {
    (async () => {
      if (!token) { setState("error"); setError("Missing signing token."); return; }
      const res = await ceremonyGet(token);
      if (!mounted.current) return;
      if (res.status === 404) { setState("error"); setError(res.data?.message || "This signing link is not valid."); return; }
      if (res.status === 410) { setState("error"); setError(res.data?.message || "This signing link is no longer active."); return; }
      if (res.status !== 200) { setState("error"); setError(res.text || "Could not load agreement."); return; }
      const data = res.data || {};
      setInfo(data);
      const fs = (data.fields || []).map((f) => ({ ...f, cid: f._id }));
      setFields(fs);
      const v = {};
      for (const f of fs) if (f.value != null) v[f._id] = f.value;
      setValues(v);
      // load the document bytes
      const d = (data.documents || [])[0];
      if (d?._id && d.hasFile) {
        const blob = await ceremonyDoc(token, d._id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          setDocUrl(url);
        }
      }
      setState("ready");
    })();
  }, [token]);

  useEffect(() => () => { if (docUrl) URL.revokeObjectURL(docUrl); }, [docUrl]);

  const signerFieldIds = new Set(fields.map((f) => f._id));
  const signatureTargets = fields.filter((f) => f.type === "SIGNATURE");

  function updateValue(id, val) {
    setValues((prev) => ({ ...prev, [id]: val }));
    setFields((prev) => prev.map((f) => (f._id === id ? { ...f, value: val } : f)));
  }

  async function handleSubmit() {
    if (!consent) { setError("Please accept the electronic signature consent."); return; }
    if (signatureTargets.length && !signatureDataUrl) { setError("Please sign using the pad below."); return; }
    setSubmitting(true);
    setError("");
    const valuesPayload = Object.entries(values)
      .filter(([k]) => k && !signatureTargets.some((t) => t._id === k))
      .map(([fieldId, value]) => ({ fieldId, value: String(value ?? "") }));
    const res = await ceremonySign(token, {
      consentAccepted: true,
      signature: signatureDataUrl ? { mode: "DRAW", dataUrl: signatureDataUrl, points: [] } : { mode: "DRAW", dataUrl: "", points: [] },
      values: valuesPayload,
    });
    if (res.status === 410) { setState("error"); setError(res.data?.message || "This signing link is no longer active."); return; }
    if (res.status !== 200) { setError(res.data?.message || res.text); return; }
    setState("done");
  }

  async function handleDecline() {
    if (!declineReason.trim()) { setError("Please provide a reason."); return; }
    if (!consent) { setError("Please accept the consent before declining."); return; }
    const res = await ceremonyDecline(token, { consentAccepted: true, reason: declineReason.trim() });
    if (res.status !== 200) { setError(res.data?.message || res.text); return; }
    setState("declined");
  }

  if (state === "loading") {
    return <div className="publicSignPage"><p>Loading your agreement…</p></div>;
  }
  if (state === "error") {
    return <div className="publicSignPage"><h1>Not available</h1><p>{error}</p></div>;
  }
  if (state === "done") {
    return <div className="publicSignPage"><h1>Signed</h1><p>{info?.message || "Thank you — your signature has been recorded."}</p><p>The agreement is complete.</p></div>;
  }
  if (state === "declined") {
    return <div className="publicSignPage"><h1>Declined</h1><p>The agreement was declined.</p></div>;
  }

  return (
    <div className="publicSignPage">
      <header className="publicSignPage__head">
        <h1>{info?.title}</h1>
        <p className="doc-form-note">Review the agreement below. Place any missing values, then draw your signature.</p>
      </header>
      {error ? <div className="fieldError">{error}</div> : null}
      <main className="publicSignPage__canvas">
        {docUrl ? (
          <PdfFieldCanvas
            pdfUrl={docUrl}
            fields={fields}
            selectedId={null}
            mode="sign"
            signerFieldIds={signerFieldIds}
            onChange={(cid, patch) => {
              if (patch && patch.value !== undefined) updateValue(cid, patch.value);
            }}
            onSignatureRequest={() => setShowPad(true)}
          />
        ) : (
          <p className="doc-form-note">Loading document…</p>
        )}
      </main>
      <section className="publicSignPage__fields" style={{ display: "none" }}>
        {null}
      </section>
      <section className="publicSignPage__sign">
        <h2>Your signature</h2>
        <p className="doc-form-note">Draw below, then confirm.</p>
        {showPad && (
          <SignaturePad
            onSign={(url) => { setSignatureDataUrl(url); setShowPad(false); }}
            width={420}
            height={160}
          />
        )}
        {!showPad && signatureDataUrl ? <img src={signatureDataUrl} alt="your signature" style={{ border: "1px solid #ccc", maxWidth: "100%" }} /> : null}
        {!showPad ? (
          <button type="button" className="ioButton ioButton--sm" onClick={() => setShowPad(true)}>
            {signatureDataUrl ? "Re-draw signature" : "Draw signature"}
          </button>
        ) : null}
      </section>
      <footer className="publicSignPage__foot">
        <label className="publicSignPage__consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {info?.consentText || "I consent to sign electronically."}
        </label>
        <button type="button" className="btn-primary" disabled={submitting || !consent} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Sign agreement"}
        </button>
        <button
          type="button"
          className="ghostBtn"
          disabled={submitting}
          onClick={() => setDeclining((v) => !v)}
        >
          Decline
        </button>
        {declining ? (
          <div className="publicSignPage__decline">
            <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Reason for declining" rows={3} />
            <button type="button" className="dangerBtn miniBtn" disabled={submitting} onClick={handleDecline}>Confirm decline</button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
