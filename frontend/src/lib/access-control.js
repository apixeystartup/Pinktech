export const ROUTE_PERMISSIONS = {
  "/tenants": ["tenant.manage"],
  "/roles": ["role.view"],
  "/org-employees": ["user.view"],
  "/employee-management": ["employee.manage"],
  "/doctors": ["doctor.view"],
  "/forms": ["form.view"],
  "/kyc": ["kyc.manage", "workflow.submit"],
  "/notifications": [],
  "/audit": [],
};

const NAV_SECTIONS = [
  {
    items: [
      { to: "/app", label: "Dashboard", permissions: [] },
      { to: "/app/tenants", label: "Tenants", permissions: ROUTE_PERMISSIONS["/tenants"], superAdminOnly: true },
      { to: "/app/roles", label: "Roles", permissions: ROUTE_PERMISSIONS["/roles"], adminOnly: true },
      { to: "/app/org-employees", label: "Organization", permissions: ROUTE_PERMISSIONS["/org-employees"] },
      { to: "/app/employee-management", label: "Employees", permissions: ROUTE_PERMISSIONS["/employee-management"], adminOnly: true },
      { to: "/app/doctors", label: "Doctors", permissions: ROUTE_PERMISSIONS["/doctors"] },
      { to: "/app/forms", label: "Forms", permissions: ROUTE_PERMISSIONS["/forms"], adminOnly: true },
      { to: "/app/notifications", label: "Inbox & activity", permissions: ROUTE_PERMISSIONS["/notifications"] },
    ],
  },
];

export function canAccessRoute(path, permissionCodes = []) {
  if (permissionCodes.includes("*")) return true;
  const required = ROUTE_PERMISSIONS[path] || [];
  if (!required.length) return true;
  return required.some((code) => permissionCodes.includes(code));
}

export function isAdminRole(accountRole, isSuperAdmin = false) {
  return Boolean(isSuperAdmin) || accountRole === "super_admin" || accountRole === "tenant_admin";
}

function canAccessNavItem(item, permissionCodes = [], isSuperAdmin = false, accountRole = null) {
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (item.adminOnly && !isAdminRole(accountRole, isSuperAdmin)) return false;
  if (permissionCodes.includes("*")) return true;
  return (item.permissions || []).some((code) => permissionCodes.includes(code));
}

export function getNavSections(permissionCodes = [], isSuperAdmin = false, accountRole = null, options = {}) {
  const hidden = new Set((options.hideRoutes || []).map((route) => String(route)));
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => !hidden.has(item.to))
      .filter((item) => canAccessNavItem(item, permissionCodes, isSuperAdmin, accountRole)),
  })).filter((section) => section.items.length > 0);
}

export function getRbacHbacGuidance() {
  return [
    "Access control is disabled: every signed-in user has all permissions, so all pages and actions are available.",
    "KYC uses kyc.manage (or workflow.submit for older roles). Doctor form cards carry their own approve / send-back actions, so no separate approvals page is needed. Notifications use notification.compose (or report.view).",
    "Org Explore uses user.view (or tenant.manage) for the org embed directory and tree.",
    "Employee Management uses employee.manage to list employees and manage credentials.",
    "Doctor Management uses doctor.view to browse the directory and doctor.manage to create or edit doctor profiles and assign compliance forms.",
    "Forms (the form builder) is admin-only: only a super admin or tenant admin creates, edits, or deletes a form definition — employees fill forms out but never build them.",
    "Assigning a doctor's compliance form is admin-only too: the admin picks a managing employee, then copies the link from the form card and sends it to the doctor over any channel. No email is needed or sent.",
  ];
}
