import { Link } from "react-router-dom";

const PAGE_HINTS = {
  "/app/tenants": {
    title: "Next: set up access",
    detail: "After creating a tenant, define its roles and add its team.",
    to: "/app/roles",
    action: "Go to roles",
  },
  "/app/roles": {
    title: "Next: add your team",
    detail: "Choose the right tenant in the header, then assign roles as you add employees.",
    to: "/app/employee-management",
    action: "Go to employees",
  },
  "/app/employee-management": {
    title: "Next: prepare a form",
    detail: "Once your team is ready, create the form they will use with doctors.",
    to: "/app/forms",
    action: "Go to forms",
  },
  "/app/forms": {
    title: "Next: onboard a doctor",
    detail: "Publish a form, then assign it to a doctor from their profile.",
    to: "/app/doctors",
    action: "Go to doctors",
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
          title: "Next: open a doctor profile",
          detail: "Select a doctor's name to review their details, forms and approval progress.",
        }
      : pathname === "/app/kyc"
        ? {
            title: "Next: send a verification link",
            detail: "Create or select an external user, choose Aadhaar or PAN, then send the OTP link.",
          }
        : pathname === "/app/notifications"
          ? {
              title: "Next: follow the linked item",
              detail: "Open a notification's related record to review or act on it.",
            }
          : pathname === "/app/audit"
            ? {
                title: "Tip: narrow the activity",
                detail: "Use the filters to find the event, then open its record for more context.",
              }
            : PAGE_HINTS[pathname];

  if (!page) return null;

  const flow = ROLE_FLOWS[accountRole] || [];
  const activeIndex = flow.findIndex((step) => step.to === pathname);
  const next = activeIndex >= 0 ? flow[activeIndex + 1] : null;

  return (
    <aside className="workflow-hint" aria-label="Guidance for this page">
      <span className="workflow-hint-mark" aria-hidden="true" />
      <div className="workflow-hint-copy">
        <strong>{page.title}</strong>
        <span>{page.detail}</span>
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
