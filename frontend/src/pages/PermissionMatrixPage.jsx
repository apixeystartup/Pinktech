import ModulePage from "../components/common/ModulePage";
import DataTable from "../components/common/DataTable";

const matrix = [
  { role: "Tenant Admin", canView: "All core/admin modules", canApprove: "Yes", audit: "Yes" },
  { role: "Level 1 Manager", canView: "Workflows, forms, positions, assignments", canApprove: "Stage 1", audit: "Limited" },
  { role: "Level 2 Approver", canView: "Workflow details, reports", canApprove: "Stage 2/final", audit: "Yes" },
  { role: "Staff", canView: "Assigned submission views", canApprove: "No", audit: "No" },
];

function PermissionMatrixPage() {
  return (
    <ModulePage title="Permission Matrix Tester" description="Reference matrix for RBAC debugging during manual test runs.">
      <DataTable
        columns={[
          { key: "role", label: "Role" },
          { key: "canView", label: "Can Access" },
          { key: "canApprove", label: "Approval Rights" },
          { key: "audit", label: "Audit Access" },
        ]}
        rows={matrix}
      />
      <p className="small-note">
        Real enforcement is backend-driven by permission codes and hierarchy checks.
      </p>
    </ModulePage>
  );
}

export default PermissionMatrixPage;
