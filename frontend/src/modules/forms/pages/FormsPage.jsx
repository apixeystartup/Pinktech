import { useState } from "react";
import ModulePage from "../../../components/common/ModulePage";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";

function FormsPage() {
  const [tab, setTab] = useState("builder");
  return (
    <ModulePage
      title={tab === "builder" ? "Forms" : ""}
      description={
        tab === "builder"
          ? "Schema-driven forms (pink-form): design questions, share the public link, and review submissions with PDF receipts."
          : ""
      }
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
