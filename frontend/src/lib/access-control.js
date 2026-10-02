export const ROUTE_PERMISSIONS = {
  "/tenants": ["tenant.manage"],
  "/roles": ["role.view"],
  "/permissions": ["role.view"],
  "/org-employees": ["user.view"],
  "/employee-management": ["employee.manage"],
  "/workflows": ["kyc.manage", "workflow.submit"],
  "/form-dispatch-approvals": ["kyc.manage", "workflow.submit", "tenant.manage"],
  "/forms": ["form.view"],
  "/kyc": ["kyc.manage", "workflow.submit"],
  "/notifications": [],
  "/audit": ["audit.view"],
};

const NAV_SECTIONS = [
  {
    title: "Core",
    items: [
      { to: "/", label: "Dashboard", permissions: [] },
      { to: "/permissions", label: "Access catalog", permissions: ROUTE_PERMISSIONS["/permissions"] },
      { to: "/tenants", label: "Tenants", permissions: ROUTE_PERMISSIONS["/tenants"] },
      { to: "/roles", label: "Roles", permissions: ROUTE_PERMISSIONS["/roles"] },
      { to: "/org-employees", label: "ORG employee", permissions: ROUTE_PERMISSIONS["/org-employees"] },
      { to: "/employee-management", label: "Employee Management", permissions: ROUTE_PERMISSIONS["/employee-management"] },
    ],
  },
  {
    title: "Workflow",
    items: [
      { to: "/workflows", label: "Workflows", permissions: ROUTE_PERMISSIONS["/workflows"] },
      { to: "/form-dispatch-approvals", label: "Form approvals", permissions: ROUTE_PERMISSIONS["/form-dispatch-approvals"] },
      { to: "/forms", label: "Forms", permissions: ROUTE_PERMISSIONS["/forms"] },
    ],
  },
  {
    title: "Compliance",
    items: [
      { to: "/kyc", label: "KYC", permissions: ROUTE_PERMISSIONS["/kyc"] },
      { to: "/notifications", label: "Notifications", permissions: ROUTE_PERMISSIONS["/notifications"] },
      { to: "/audit", label: "Audit Logs", permissions: ROUTE_PERMISSIONS["/audit"] },
    ],
  },
];

export function canAccessRoute(path, permissionCodes = []) {
  if (permissionCodes.includes("*")) return true;
  const required = ROUTE_PERMISSIONS[path] || [];
  if (!required.length) return true;
  return required.some((code) => permissionCodes.includes(code));
}

export function getNavSections(permissionCodes = []) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessRoute(item.to, permissionCodes)),
  })).filter((section) => section.items.length > 0);
}

export function getRbacHbacGuidance() {
  return [
    "Access is grant-based: each route checks one or more permission codes (you need any match).",
    "Use Access catalog for plain-language definitions; assign codes to custom roles on the Roles page.",
    "KYC uses kyc.manage (or workflow.submit for older roles). External forms and Form approvals share that gate so IC-only users without those codes see a simpler nav. Notifications use notification.compose (or report.view).",
    "ORG employee uses user.view (or tenant.manage) for the org embed directory and tree.",
    "Employee Management uses employee.manage to list employees and manage credentials.",
  ];
}
