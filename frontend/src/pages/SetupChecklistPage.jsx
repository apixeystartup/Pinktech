import { Link } from "react-router-dom";
import ModulePage from "../components/common/ModulePage";

const steps = [
  { title: "Login as super admin", route: "/login" },
  { title: "Create tenant", route: "/tenants" },
  { title: "Create roles and map permissions", route: "/roles" },
  { title: "Org directory: workbook, roles, reporting tree", route: "/org-employees" },
  { title: "Assign users to positions", route: "/assignments" },
  { title: "Invite and OTP activate users", route: "/verify-otp" },
  { title: "Create workflow", route: "/workflows" },
  { title: "Create forms and share public links (Forms page)", route: "/forms" },
  { title: "Trigger KYC", route: "/kyc" },
  { title: "Check notifications + audit logs", route: "/notifications" },
];

function SetupChecklistPage() {
  return (
    <ModulePage title="Guided Setup Checklist" description="Use this sequence to validate full tenant onboarding flow.">
      <ol className="checklist-list">
        {steps.map((step) => (
          <li key={step.title}>
            <span>{step.title}</span>
            <Link to={step.route}>Open</Link>
          </li>
        ))}
      </ol>
      <p className="small-note">
        Keep Google Forms optional. Core flow is native forms + workflow + RBAC/HBAC.
      </p>
    </ModulePage>
  );
}

export default SetupChecklistPage;
