import { Link } from "react-router-dom";

const PAGE_HINTS = {
  "/app/tenants": {
    title: "Next: define the roles for your tenant.",
    detail: "Set up the roles your organization needs before adding its team.",
    to: "/app/roles",
    action: "Go to roles",
  },
  "/app/roles": {
    title: "Next: review your organization.",
    detail: "Confirm the organization structure before managing its employees.",
    to: "/app/org-employees",
    action: "Go to organization",
  },
  "/app/employee-management": {
    title: "Next: manage your doctors.",
    detail: "Add doctors before assigning them forms.",
    to: "/app/doctors",
    action: "Go to doctors",
  },
  "/app/org-employees": {
    title: "Next: manage your employees.",
    detail: "Review the organization structure and update employee details.",
    to: "/app/employee-management",
    action: "Go to employees",
  },
};

function WorkflowHint({ pathname, search }) {
  const isFormsBuilder = new URLSearchParams(search).get("tab") === "builder";
  const page = pathname === "/app/forms"
    ? isFormsBuilder
      ? {
          title: "Next: manage your doctors.",
          detail: "Your forms are ready to use with the doctors in your tenant.",
          to: "/app/doctors",
          action: "Go to doctors",
        }
      : {
          title: "Next: create a form.",
          detail: "Open Builder to create a form from your tenant's templates.",
          to: "/app/forms?tab=builder",
          action: "Open Builder",
        }
    : pathname.match(/^\/app\/doctors\/[^/]+$/)
    ? {
        title: "Next: review the assigned work",
        detail: "Select a compliance form row to open its details and available actions.",
      }
    : pathname === "/app/doctors"
      ? {
          title: "Next: go to Forms",
          detail: "Choose a form template to assign to a doctor.",
          to: "/app/forms",
          action: "Go to Forms",
        }
      : pathname === "/app/kyc"
        ? {
            title: "Next: send a verification link",
            detail: "Create or select an external user, choose Aadhaar or PAN, then send the OTP link.",
          }
        : pathname === "/app/audit"
          ? {
              title: "Tip: narrow the activity",
              detail: "Use the filters to find the event, then open its record for more context.",
              noLink: true,
            }
          : PAGE_HINTS[pathname];

  if (!page) return null;

  return (
    <aside className="workflow-hint" aria-label="Guidance for this page">
      <span className="workflow-hint-mark" aria-hidden="true" />
      <div className="workflow-hint-copy">
        {page.title ? <strong>{page.title}</strong> : null}
        {page.detail ? <span>{page.detail}</span> : null}
      </div>
      {page.to ? (
        <Link className="workflow-hint-link" to={page.to}>
          {page.action}
        </Link>
      ) : null}
    </aside>
  );
}

export default WorkflowHint;
