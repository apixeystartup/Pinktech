/* eslint-disable react-hooks/set-state-in-effect -- public page fetch */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicFormRenderer from "../components/schema-forms/DynamicFormRenderer";
import { getPublicSchemaDispatch } from "../lib/schemaFormsPublic";
import "../styles/schema-forms.css";

function PublicSchemaDispatchPage() {
  const { token } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicSchemaDispatch(token)
      .then((data) => setPayload(data))
      .catch((err) => setError(err.message || "Invalid or expired link."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="schema-forms schema-forms--public">
        <div className="schema-forms__public-card">
          <h1>Loading…</h1>
          <p className="hint">Fetching your form.</p>
        </div>
      </div>
    );
  }

  if (error || !payload?.module) {
    return (
      <div className="schema-forms schema-forms--public">
        <div className="schema-forms__public-card">
          <h1>Form unavailable</h1>
          <p className="hint">{error || "This link is not valid."}</p>
        </div>
      </div>
    );
  }

  const due = payload.dueDate ? new Date(payload.dueDate).toLocaleString() : null;

  return (
    <div className="schema-forms schema-forms--public">
      <div className="schema-forms__public-card">
        <header className="schema-forms__public-header">
          <p className="hint" style={{ marginBottom: "0.35rem" }}>
            <strong>{payload.tenantName}</strong>
          </p>
          <h1>{payload.module.name}</h1>
          {payload.module.schema?.settings?.description ? (
            <p className="hint">{payload.module.schema.settings.description}</p>
          ) : null}
          {payload.instructions ? (
            <div className="agreementCard glassPanel" style={{ marginTop: "1rem", textAlign: "left" }}>
              <h2 style={{ marginTop: 0 }}>Instructions</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{payload.instructions}</p>
            </div>
          ) : null}
          {due ? (
            <p className="hint" style={{ marginTop: "0.75rem" }}>
              <strong>Complete by:</strong> {due}
            </p>
          ) : null}
        </header>
        <DynamicFormRenderer moduleDoc={payload.module} dispatchToken={payload.token || token} />
      </div>
    </div>
  );
}

export default PublicSchemaDispatchPage;
