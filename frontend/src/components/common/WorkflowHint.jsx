import { Link } from "react-router-dom";

const PAGE_HINTS = {
  "/app/tenants": {
    title: "Next: create your first tenant, then add doctors and employees.",
    noLink: true,
  },
  "/app/roles": {
    title: "Next: review the organization, then choose the roles each team needs.",
    noLink: true,
  },
  "/app/employee-management": {
    title: "Next: prepare a form",
    detail: "Once your team is ready, create the form they will use with doctors.",
    to: "/app/forms",
    action: "Go to forms",
  },
  "/app/forms": {
    title: "Next: choose a template, then open Builder to create the form.",
    noLink: true,
  },
  "/app/org-employees": {
    title: "Next: review your team",
    detail: "Check the organization structure and update employee details when needed.",
    to: "/app/employee-management",
    action: "Manage employees",
  },
};

const ROLE_FLOWS = {
  super_admin: [
    { label: "Tenants", to: "/app/tenants" },
    { label: "Roles", to: "/app/roles" },
    { label: "Employees", to: "/app/employee-management" },
    { label: "Forms", to: "/app/forms" },
    { label: "Doctors", to: "/app/doctors" },
  ],
  tenant_admin: [
    { label: "Roles", to: "/app/roles" },
    { label: "Employees", to: "/app/employee-management" },
    { label: "Forms", to: "/app/forms" },
    { label: "Doctors", to: "/app/doctors" },
  ],
};

function WorkflowHint({ pathname, accountRole }) {
  const page = pathname.match(/^\/app\/doctors\/[^/]+$/)
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

  const flow = ROLE_FLOWS[accountRole] || [];
  const activeIndex = flow.findIndex((step) => step.to === pathname);
  const next = !page.noLink && activeIndex >= 0 ? flow[activeIndex + 1] : null;

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
      ) : next ? (
        <Link className="workflow-hint-link" to={next.to}>
          Next: {next.label}
        </Link>
      ) : null}
    </aside>
  );
}

export default WorkflowHint;
