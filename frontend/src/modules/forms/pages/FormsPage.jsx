import ModulePage from "../../../components/common/ModulePage";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import SchemaFormsBuilder from "../SchemaFormsBuilder";

function FormsPage() {
  return (
    <ModulePage
      title="Forms"
      description="Schema-driven forms: design questions, share the public link, and review submissions with PDF receipts."
    >
      <TenantScopeBanner context="Forms" />
      <SchemaFormsBuilder />
    </ModulePage>
  );
}

export default FormsPage;
