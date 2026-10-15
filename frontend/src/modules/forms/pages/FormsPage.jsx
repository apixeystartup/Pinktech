import { useState } from "react";
import ModulePage from "../../../components/common/ModulePage";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";

function FormsPage() {
  const [tab, setTab] = useState("builder");
  return (
    <ModulePage
      title="Forms"
      description="Schema-driven forms (pink-form): design questions, share the public link, and review submissions with PDF receipts."
      actions={
        <div className="segmented-toggle" role="tablist" aria-label="Forms view">
          <span className="segmented-toggle-thumb" aria-hidden="true" />
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
      <TenantScopeBanner context="Forms" />
      {tab === "builder" ? <SchemaFormsBuilder /> : <TemplatesTab />}
    </ModulePage>
  );
}

export default FormsPage;
