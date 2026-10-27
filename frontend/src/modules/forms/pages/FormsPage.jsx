import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ModulePage from "../../../components/common/ModulePage";
import SchemaFormsBuilder from "../SchemaFormsBuilder";
import TemplatesTab from "../TemplatesTab";
import { fetchTemplates, templatesKey } from "../templatesQuery";
import useAuth from "../../../hooks/useAuth";
import api from "../../../lib/api";
import "../../../styles/schema-forms.css";
// Page-scoped redesign styles — imported last so they win ties against the
// module's other stylesheets (wireframe.css still loads after everything).
import "../../../styles/wf-forms.css";

const EMPTY_ORG = { name: "", code: "", email: "", phone: "", address: "", registrationNumber: "", signature: "", stamp: "" };

/** /tenants/current payload → the editable Party 1 org shape. */
function tenantToOrg(t) {
  return {
    name: t.name || "",
    code: t.code || "",
    email: t.email || "",
    phone: t.phone || "",
    address: t.address || "",
    registrationNumber: t.registrationNumber || t.registration_number || "",
    signature: t.signature || "",
    stamp: t.stamp || "",
  };
}

function FormsPage() {
  const { tenantContextId, currentTenant } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantKey = String(tenantContextId || "");
  const cachedTenant = (() => {
    try { return JSON.parse(localStorage.getItem("pink:org:" + tenantKey) || "null"); } catch { return null; }
  })();

  // Screens 15/16 land on Templates — "Forms templates" is the entry view.
  const tab = searchParams.get("tab") === "builder" ? "builder" : "templates";
  const setTab = (nextTab) => {
    setSearchParams(nextTab === "builder" ? { tab: "builder" } : {});
  };
  // True while the agreement/signature designer is open inside the Templates
  // tab — the page header then collapses to the designer's own toolbar row.
  const [designing, setDesigning] = useState(false);

  const queryClient = useQueryClient();
  const orgQuery = useQuery({
    queryKey: ["tenant-current", tenantKey],
    queryFn: async () => (await api.get("/tenants/current")).data || null,
    staleTime: 60000,
    ...(currentTenant || cachedTenant ? { initialData: currentTenant || cachedTenant } : {}),
  });
  // Warm the Templates list while this page is open so the tab opens instantly.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: templatesKey(tenantKey),
      queryFn: fetchTemplates,
      staleTime: 60000,
    });
  }, [queryClient, tenantKey]);

  const org = tenantToOrg(orgQuery.data || currentTenant || cachedTenant || EMPTY_ORG);

  // Templates | Builder — the wireframe's order (Screen 15 / Screen 17).
  const segToggle = (
    <div className="segmented-toggle" role="tablist" aria-label="Forms view">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "templates"}
        className={`segmented-toggle-btn${tab === "templates" ? " active" : ""}`}
        onClick={() => setTab("templates")}
      >
        Templates
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "builder"}
        className={`segmented-toggle-btn${tab === "builder" ? " active" : ""}`}
        onClick={() => {
          // Leaving the Templates tab also closes the agreement designer, so
          // the page header never hides for a screen that is no longer shown.
          setDesigning(false);
          setTab("builder");
        }}
      >
        Builder
      </button>
    </div>
  );

  const content =
    tab === "builder" ? (
      // The builder owns its whole page (list + inline editor) so the header
      // can switch to the "Edit form builder" row of Screen 19.
      <SchemaFormsBuilder org={org} toolbar={segToggle} />
    ) : (
      <ModulePage
        title={designing ? null : "Forms templates"}
        description={
          designing ? null : "Choose a template to edit, or open Builder to create a new form."
        }
        actions={null}
      >
        <div className="wf-forms wf-forms--templates">
          {designing ? null : (
            <div className="wf-seg-row">{segToggle}</div>
          )}
          {/* key=tenant: a tenant switch remounts the tab, so the editor,
              banner, and detected fields reset instead of carrying the old
              tenant's work. */}
          <TemplatesTab
            key={tenantKey || "home"}
            org={org}
            onDesigningChange={setDesigning}
          />
        </div>
      </ModulePage>
    );

  return content;
}

export default FormsPage;
