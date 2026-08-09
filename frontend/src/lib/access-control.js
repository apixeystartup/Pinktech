export const ROUTE_PERMISSIONS = {
  "/tenants": ["tenant.manage"],
  "/roles": ["role.view"],
  "/permissions": ["role.view"],
  "/org-employees": ["employee.view", "employee.assign"],
  "/employee-management": ["user.view", "user.invite"],
  "/workflows": ["workflow.status", "workflow.submit"],
  /** Form approvals: approve / reject at your level in the chain. */
  "/form-dispatch-approvals": ["workflow.approve", "workflow.reject"],
  "/forms": ["form.view"],
  /** KYC tab: create external users and run KYC verification. */
  "/kyc": ["kyc.create-user", "kyc.manage"],
  /** External Forms tab: send schema forms to external users. */
  "/kyc-external-forms": ["workflow.submit", "kyc.manage"],
  /** Inbox for all authenticated users; compose targets still gated in the Notifications API. */
  "/notifications": [],
  "/audit": ["audit.view"],
};

const NAV_ICONS = {
  "/": '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  "/permissions": '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>',
  "/tenants": '<path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>',
  "/roles": '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  "/org-employees": '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
  "/employee-management": '<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  "/workflows": '<path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>',
  "/form-dispatch-approvals": '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
  "/forms": '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>',
  "/kyc": '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>',
  "/kyc-external-forms": '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 9h-2v2H9v-2H7V9h2V7h2v2h2v2zm-1-8.5L17.5 9H13V2.5z"/>',
  "/notifications": '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>',
  "/audit": '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>',
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
      { to: "/kyc-external-forms", label: "External forms", permissions: ROUTE_PERMISSIONS["/kyc-external-forms"] },
      { to: "/notifications", label: "Notifications", permissions: ROUTE_PERMISSIONS["/notifications"] },
      { to: "/audit", label: "Audit Logs", permissions: ROUTE_PERMISSIONS["/audit"] },
    ],
  },
];

export function canAccessRoute(path, permissionCodes = []) {
  const required = ROUTE_PERMISSIONS[path] || [];
  if (!required.length) return true;
  return required.some((code) => permissionCodes.includes(code));
}

export function getNavSections(permissionCodes = []) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => canAccessRoute(item.to, permissionCodes))
      .map((item) => ({ ...item, icon: NAV_ICONS[item.to] || null })),
  })).filter((section) => section.items.length > 0);
}

export function getRbacHbacGuidance() {
  return [
    "Access is grant-based: each route checks one or more permission codes (you need any match).",
    "Use Access catalog for plain-language definitions; assign codes to custom roles on the Roles page.",
    "KYC tab requires kyc.create-user or kyc.manage. External Forms tab requires workflow.submit or kyc.manage.",
    "Form approvals require workflow.approve or workflow.reject. Approvals chain upward through the org hierarchy; rejection requires a reason.",
    "Employee Management (user.view) shows your own team for level-1 roles. Admin / super admin sees the full employee directory.",
    "ORG Employee tab (employee.view) shows org chart assignments. When checked alone, level-1 users see only their direct reports.",
  ];
}
