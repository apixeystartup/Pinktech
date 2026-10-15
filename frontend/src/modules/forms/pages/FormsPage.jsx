import { useState } from "react";
import ModulePage from "../../../components/common/ModulePage";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";
import useAuth from "../../../hooks/useAuth";

function FormsPage() {
  const [tab, setTab] = useState("builder");
  const { currentTenant } = useAuth();
  const tenantLabel = currentTenant ? `${currentTenant.name} (${currentTenant.code})` : null;
  return (
    <ModulePage
      title={
        <>
          Forms
          {tenantLabel ? <span className="module-title-tenant">{tenantLabel}</span> : null}
        </>
      }
      description="Schema-driven forms (pink-form): design questions, share the public link, and review submissions with PDF receipts."
      actions={
        <div className="segmented-toggle" role="tablist" aria-label="Forms view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "builder"}
            className={`segmented-toggle-btn${tab === "builder" ? " active" : ""}`}
            onClick={() => setTab("builder")}
          >
            Builder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "templates"}
            className={`segmented-toggle-btn${tab === "templates" ? " active" : ""}`}
            onClick={() => setTab("templates")}
          >
            Templates
          </button>
        </div>
      }
    >
      {tab === "builder" ? <SchemaFormsBuilder /> : <TemplatesTab />}
    </ModulePage>
  );
}

export default FormsPage;
