/* eslint-disable react-hooks/set-state-in-effect -- public page fetch */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DynamicFormRenderer from "../components/schema-forms/DynamicFormRenderer";
import { getPublicModule } from "../lib/schemaFormsPublic";
import "../styles/schema-forms.css";

function PublicSchemaFormPage() {
  const { moduleId } = useParams();
  const [moduleDoc, setModuleDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!moduleId) return;
    setLoading(true);
    getPublicModule(moduleId)
      .then((result) => setModuleDoc(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [moduleId]);

  if (loading) {
    return (
      <div className="schema-forms schema-forms--public">
        <div className="schema-forms__public-card">
          <h1>Loading…</h1>
          <p className="hint">Fetching form definition.</p>
        </div>
      </div>
    );
  }

  if (error || !moduleDoc) {
    return (
      <div className="schema-forms schema-forms--public">
        <div className="schema-forms__public-card">
          <h1>Form Not Found</h1>
          <p className="hint">{error || "Invalid form link."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schema-forms schema-forms--public">
      <div className="schema-forms__public-card">
        <header className="schema-forms__public-header">
          <h1>{moduleDoc.name}</h1>
          {moduleDoc.schema?.settings?.description ? <p className="hint">{moduleDoc.schema.settings.description}</p> : null}
        </header>
        <DynamicFormRenderer moduleDoc={moduleDoc} />
      </div>
    </div>
  );
}

export default PublicSchemaFormPage;
