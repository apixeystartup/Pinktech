const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const field = (label, type = "text", placeholder = "", options = {}) => {
  const wide = options.wide ? " wf-field--wide" : "";
  const required = options.required ? " *" : "";
  let control = "";
  if (type === "select") {
    control = `<select aria-label="${label}">${(options.options || ["Select…"]).map((item) => `<option>${item}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    control = `<textarea placeholder="${placeholder}" aria-label="${label}"></textarea>`;
  } else if (type === "file") {
    control = `<input type="file" aria-label="${label}" ${options.accept ? `accept="${options.accept}"` : ""}>`;
  } else {
    control = `<input type="${type}" placeholder="${placeholder}" aria-label="${label}" ${options.disabled ? "disabled" : ""} ${options.value ? `value="${options.value}"` : ""}>`;
  }
  return `<label class="wf-field${wide}"><span>${label}${required}</span>${control}${options.help ? `<small class="wf-help">${options.help}</small>` : ""}</label>`;
};

const checks = (items, type = "checkbox") =>
  `<div class="wf-checks">${items.map((item) => `<label class="wf-check"><input type="${type}" name="${type === "radio" ? "wire-choice" : ""}">${item}</label>`).join("")}</div>`;

const button = (label, style = "") => `<button type="button" class="wf-button${style ? ` wf-button--${style}` : ""}" data-toast="${label} is represented in this wireframe.">${label}</button>`;

const section = (title, content, description = "") => `
  <section class="wf-section">
    <div class="wf-section-head"><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ""}</div></div>
    ${content}
  </section>`;

const panel = (content, style = "") => `<div class="wf-panel${style ? ` wf-panel--${style}` : ""}">${content}</div>`;

const table = (headers, rows) => `
  <div class="wf-table-wrap"><table class="wf-table">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;

const status = (label, kind = "") => `<span class="wf-status${kind ? ` wf-status--${kind}` : ""}">${label}</span>`;
const rowActions = (...items) => `<span class="wf-row-actions">${items.map((item) => button(item, "small")).join("")}</span>`;
const check = (label) => `<label class="wf-check"><input type="checkbox">${label}</label>`;

const metric = (label, value, note = "") => `
  <div class="wf-metric"><div class="wf-metric-label">${label}</div><div class="wf-metric-value">${value}</div>${note ? `<div class="wf-metric-note">${note}</div>` : ""}</div>`;

const screens = [
  {
    id: "landing", group: "Public website", title: "Pinktech", route: "/",
    access: "Public",
    description: "Marketing landing page: explain the intake-to-signature workflow and move visitors to the workspace sign-in.",
    body: () => `
      <div class="wf-body">
        ${panel(`<div class="wf-grid wf-grid--split"><div><p class="wf-overline">Landing · first screen</p><h2 class="wf-panel-title" style="font-size:28px;line-height:1.15">From the first detail to the final signature.</h2><p class="wf-help">Collect details, review documents, prepare agreements, and keep signatures moving in one considered workflow.</p><div class="wf-actions" style="margin-top:18px">${button("Enter your workspace", "primary")}</div></div><div class="wf-preview-sheet"><h3>Pinktech workspace</h3><p>Collect → Review → Prepare → Sign</p><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-line wf-preview-line--short"></div></div></div>`)}
        ${section("Workflow from intake to signature", `<div class="wf-card-list">${["Profiles · collect identity and practice details", "Documents · keep supporting files in context", "Agreements · prepare reusable documents", "Signatures · track requests and completion"].map((x) => `<article class="wf-card"><h3>${x.split(" · ")[0]}</h3><p>${x.split(" · ")[1]}</p></article>`).join("")}</div>`)}
        ${section("A connected workspace", panel(`<div class="wf-grid wf-grid--split"><div><h3 class="wf-panel-title">Every step has a place.</h3><p class="wf-help">Profile, document and agreement work stays connected through each review and approval step.</p>${button("Open your workspace", "primary")}</div><div class="wf-preview-sheet"><div class="wf-list-row"><span>Profile details</span>${status("Ready")}</div><div class="wf-list-row"><span>Agreement</span>${status("In review")}</div><div class="wf-list-row"><span>Signature</span>${status("Waiting")}</div></div></div>`))}
        ${section("Footer", panel(`<div class="wf-inline"><strong>Pinktech</strong><span class="wf-help">© 2026 Pinktech</span>${button("Sign in")}</div>`))}
      </div>`,
  },
  {
    id: "dashboard", group: "Workspace", title: "Dashboard", route: "/app",
    access: "All signed-in roles",
    description: "Role-specific overview: global tenant totals for super admins, tenant overview for admins, and assigned work for employees.",
    body: () => `
      <div class="wf-body">
        <div class="wf-overview">${metric("Total Tenants", "1")}${metric("Total Doctors", "1")}${metric("Forms Created", "1")}${metric("Forms Submitted", "6")}</div>
        ${section("Tenant overview", table(["Tenant", "Doctors", "Employees", "Forms", "Actions"], [
          ["Apixey Private Limited", "1", "7", "6", rowActions("Open tenant", "Refresh")],
          ["Northstar Health", "4", "28", "19", rowActions("Open tenant", "Refresh")],
        ]), "Super-admin view · expand a tenant row to review its employees and doctors.")}
        ${section("Tenant / employee overview", `<div class="wf-grid wf-grid--split">${panel(`<h3 class="wf-panel-title">My overview</h3><div class="wf-list">${["Employees under me · 7", "Doctors I onboarded · 3", "Forms needing attention · 2"].map((x) => `<div class="wf-list-row"><span>${x.split(" · ")[0]}</span><strong>${x.split(" · ")[1]}</strong></div>`).join("")}</div>`)}${panel(`<h3 class="wf-panel-title">Employees under me</h3>${table(["Name", "Employee ID", "Role", "Status"], [["Asha Kumar", "PT-014", "Regional Lead", status("Active", "good")], ["Ravi Menon", "PT-021", "Field Executive", status("Invited")]])}`)}</div>`, "Admin and employee view · figures and rows follow the active tenant and reporting line.")}
        ${section("Expanded employee row", panel(`<div class="wf-inline" style="justify-content:space-between"><strong>Asha Kumar · PT-014</strong>${button("Edit employee")}</div><div class="wf-grid wf-grid--3" style="margin-top:12px">${field("Employee code", "text", "Employee code", { value: "PT-014" })}${field("Role", "select", "", { options: ["Regional Lead", "Approver", "Field Executive"] })}${field("Status", "select", "", { options: ["Active", "Invited", "Disabled"] })}</div><div class="wf-actions" style="margin-top:12px">${button("Save changes", "primary")}${button("Cancel")}</div>`))}
      </div>`,
  },
  {
    id: "tenants", group: "Workspace", title: "Tenants", route: "/app/tenants",
    access: "Super admin",
    description: "Create and manage tenant lifecycle, initial admin credentials, plans, agreement-header organization data, and tenant status.",
    body: () => `
      <div class="wf-body">
        ${section("Create tenant", panel(`<div class="wf-grid wf-grid--3">${field("Name", "text", "", { required: true })}${field("Code", "text", "", { required: true })}${field("Admin email", "email", "admin@company.com", { required: true })}</div><div class="wf-inline" style="justify-content:space-between;margin-top:14px">${check("Starter plan")}<div class="wf-actions">${button("Create", "primary")}${button("Create & Send Creds")}</div></div>`))}
        ${section("Tenant directory", table(["Name", "Code", "Admin email", "Plan", "Status", "Actions"], [
          ["Apixey Private Limited", "APIXEY", "admin@apixey.com", "Starter", status("Active", "good"), rowActions("Edit", "Send Creds", "Always Active")],
          ["Northstar Health", "NORTHSTAR", "admin@northstar.test", "Pro", status("Active", "good"), rowActions("Edit", "Send Creds", "Deactivate", "Delete")],
        ]))}
        ${section("Edit tenant dialog", panel(`<div class="wf-grid wf-grid--2">${field("Name", "text", "", { value: "Northstar Health" })}${field("Code", "text", "", { value: "NORTHSTAR", disabled: true })}${field("Admin email", "email", "admin@company.com")}${field("Plan", "select", "", { options: ["Starter", "Basic", "Pro", "Enterprise"] })}${field("Address (agreement header)", "text", "Registered office address", { wide: true })}${field("Phone (agreement header)", "tel", "+91 …")}${field("Registration no. (agreement header)", "text", "CIN / registration number")}</div><div class="wf-actions" style="margin-top:15px">${button("Save", "primary")}${button("Cancel")}</div>`))}
      </div>`,
  },
  {
    id: "roles", group: "Workspace", title: "Roles", route: "/app/roles",
    access: "Super admin / tenant admin",
    description: "Create roles, inspect organization-level scope, edit and delete custom roles, and invite people into a selected role.",
    body: () => `
      <div class="wf-body">
        <div class="wf-note">Access-control selection is currently disabled in the application. Role levels and scope remain visible; permission controls are shown as the underlying setup surface.</div>
        ${section("Create or edit role", panel(`<div class="wf-grid wf-grid--split">${field("Role name", "text", "e.g. Payroll Approver")}${field("Organization level", "select", "", { options: ["Level 1", "Level 2", "Level 3", "Level 4"] })}${field("Scope", "select", "", { options: ["Organization", "Region", "Zone", "HQ"] })}${field("Permissions", "select", "", { options: ["All permissions (access control disabled)", "Custom permissions"] })}</div><div class="wf-actions" style="margin-top:13px">${button("Create role", "primary")}${button("Save changes")}${button("Cancel")}</div>`))}
        ${section("Existing roles", `<div class="wf-actions" style="margin-bottom:10px">${button("Select all")}${button("Delete selected (0)")}${button("Invite by selected role", "primary")}</div>${table(["Select", "Name", "Org level", "Scope", "People", "Role ID", "Actions"], [
          [check(""), "Tenant Admin", "1", "Tenant", "2", "rl_01a2…", rowActions("Edit")],
          [check(""), "Regional Lead", "2 (override)", "Region", "8", "rl_07bd…", rowActions("Edit")],
          [check(""), "System role", "1", "Tenant", "1", "—", "—"],
        ])}`)}
        ${section("Invite employees dialog", panel(`<p class="wf-help">Recipients prefill from people who already have the selected seat role. Remove anyone before sending; manually added addresses can be appended.</p><div class="wf-grid wf-grid--2" style="margin-top:12px">${field("Default display name (manual emails only)", "text", "New team member")}${field("Add more emails", "textarea", "colleague@company.com, other@company.com")}</div><div class="wf-list-row"><span>Recipients</span><strong>3 selected · name@company.com ×</strong></div><div class="wf-actions" style="margin-top:12px">${button("Add email")}${button("Cancel")}${button("Send invites", "primary")}</div>`))}
      </div>`,
  },
  {
    id: "org-explore", group: "Workspace", title: "Org Explore", route: "/app/org-employees",
    access: "Users with org view; workbook actions for managers",
    description: "Directory, reporting tree, role and seat management, workbook import, employee profile actions, and removed-person restoration.",
    body: () => `
      <div class="wf-body">
        <div class="wf-overview">${metric("People", "42")}${metric("Filled", "39")}${metric("Vacant", "3")}${metric("Roles / levels", "8 / 5")}</div>
        <div class="wf-tabs" role="tablist"><button class="wf-tab" aria-selected="true">Org tree</button><button class="wf-tab">Org explorer</button><button class="wf-tab">Roles</button></div>
        <div class="wf-actions">${field("Workbook (.xlsx)", "file", "", { accept: ".xlsx" })}${button("Upload xlsx")}${button("Reload")}${button("Removed people (2)")}</div>
        ${section("Directory filters and people", `<div class="wf-tree"><div>${panel(`<div class="wf-grid">${field("Search", "search", "Name, EMP ID, email, designation…", { wide: true })}${field("Zone", "select", "", { options: ["All Zones", "North", "South"] })}${field("Region", "select", "", { options: ["All Regions", "Chennai", "Coimbatore"] })}${field("State", "select", "", { options: ["All States", "Tamil Nadu", "Karnataka"] })}${field("HQ", "select", "", { options: ["All HQs", "Chennai HQ", "Bengaluru HQ"] })}${field("Role", "select", "", { options: ["All Roles", "Regional Lead", "Field Executive"] })}${field("Level", "select", "", { options: ["All Levels", "Level 1", "Level 2", "Level 3"] })}</div><div class="wf-checks" style="margin:12px 0">${check("Vacant only")}${check("Filled only")}</div>${button("Clear filters")}${`<div class="wf-rule"></div><div class="wf-list-row"><span>Meera Patel · Regional Lead · PT-014</span>${status("Selected")}</div><div class="wf-list-row"><span>Arun Kumar · Field Executive · PT-021</span>${button("Select", "small")}</div><div class="wf-list-row"><span>Vacant seat · Sales Manager</span>${button("Fill seat", "small")}</div>`}`)}</div><div>${panel(`<h3 class="wf-panel-title">Org tree / Profile</h3><p class="wf-help">Select a person to explore manager and reporting relationships or inspect their profile.</p><div class="wf-tree-children"><div class="wf-tree-node"><span>Meera Patel · Regional Lead</span>${button("Actions", "small")}</div><div class="wf-tree-children"><div class="wf-tree-node"><span>Arun Kumar · Field Executive</span>${button("Actions", "small")}</div><div class="wf-tree-node"><span>Vacant · Area Manager</span>${button("Fill seat", "small")}</div></div></div><div class="wf-rule"></div><div class="wf-list"><div class="wf-list-row"><span>Employee ID</span><strong>PT-014</strong></div><div class="wf-list-row"><span>Official email</span><strong>meera@company.test</strong></div><div class="wf-list-row"><span>Role / level</span><strong>Regional Lead · L2</strong></div><div class="wf-list-row"><span>Manager</span><strong>Ravi Nair</strong></div><div class="wf-list-row"><span>Zone / Region / State / HQ</span><strong>South · Chennai · TN · Chennai HQ</strong></div></div><div class="wf-actions" style="margin-top:12px">${button("Add person")}${button("Change manager")}${button("Change role")}${button("Edit official email")}${button("Mark as left", "danger")}</div>`)} </div></div>`)}
        ${section("Add person dialog", panel(`<div class="wf-grid wf-grid--3">${field("Full name", "text", "", { required: true })}${field("EMP ID", "text", "Auto-generated if blank")}${field("Email", "email", "Work email (optional)")}${field("Role", "select", "", { options: ["Select role", "Regional Lead", "Field Executive"] })}${field("Manager", "select", "", { options: ["Select manager", "Ravi Nair", "Meera Patel"] })}${field("Designation", "text", "")}${field("HQ", "text", "")}${field("Zone", "text", "")}${field("Region", "text", "")}${field("State", "text", "")}${field("Date of joining", "date")}${field("Date of birth", "date")}${field("Gender", "select", "", { options: ["Select gender", "Female", "Male", "Other"] })}</div><div class="wf-actions" style="margin-top:12px">${button("Cancel")}${button("Add person", "primary")}</div>`))}
      </div>`,
  },
  {
    id: "employees", group: "Workspace", title: "Employee Management", route: "/app/employee-management",
    access: "Super admin / tenant admin",
    description: "Filter by invitation and active status, select employees, send credentials, and reset credentials in bulk.",
    body: () => `
      <div class="wf-body">
        <div class="wf-toolbar">${["All", "Active", "Invited", "Disabled"].map((x, i) => button(x, i === 0 ? "primary" : "")).join("")}</div>
        <div class="wf-toolbar">${button("Refresh")}${button("Send Creds (0)")}${button("Reset Creds (0)")}</div>
        ${section("Employee directory", table(["Select", "Name", "Email", "Emp ID", "Roles", "Tenant admin", "Status"], [
          [check(""), "Asha Kumar", "asha@company.test", "PT-014", "Regional Lead", status("Admin", "good"), status("Active", "good")],
          [check(""), "Ravi Menon", "ravi@company.test", "PT-021", "Field Executive", "—", status("Invited", "warn")],
          [check(""), "Leela Joseph", "leela@company.test", "—", "—", status("Vacant", "warn"), status("Disabled")],
        ]))}
      </div>`,
  },
  {
    id: "doctors", group: "Workspace", title: "Doctor Management", route: "/app/doctors",
    access: "Users with doctor.view; editing and assignment depend on role",
    description: "Search and filter the doctor directory; open profiles, create/edit/delete doctors, assign a compliance form to selected doctors.",
    body: () => `
      <div class="wf-body">
        <div class="wf-toolbar"><label class="wf-field wf-search-control"><span>Search doctors</span><input type="search" placeholder="Name, email, phone, clinic…"></label><select aria-label="Filter by status"><option>All statuses</option><option>Active</option><option>Inactive</option><option>Draft</option></select><div class="wf-actions">${button("Assign Form (0)", "primary")}${button("Add Doctor")}${button("Refresh")}</div></div>
        ${section("Doctor directory", table(["Select", "Doctor", "Specialization", "Experience", "Contact", "Clinic / Hospital", "Compliance", "Status", "Actions"], [
          [check(""), "Dr. Ananya Rao<span class='wf-cell-meta'>DOC-001</span>", "Cardiology", "8 yrs", "ananya@clinic.test<span class='wf-cell-meta'>+91 98765 43210</span>", "City Care Hospital", `<div class="wf-mini-bar"><span style="width:66%"></span></div><small class="wf-cell-meta">2 / 3 complete</small>`, status("Active", "good"), rowActions("View", "Edit", "Delete")],
          [check(""), "Dr. Kiran Shah<span class='wf-cell-meta'>DOC-002</span>", "Pediatrics", "—", "kiran@clinic.test<span class='wf-cell-meta'>No phone</span>", "—", "No forms assigned", status("Draft", "warn"), rowActions("View", "Edit", "Delete")],
        ]))}
        ${section("Add / edit doctor dialog", panel(`<div class="wf-grid wf-grid--3">${field("Full name", "text", "Dr. first and last name", { required: true })}${field("Specialization", "text", "e.g. Cardiology", { required: true })}${field("Years of experience", "number", "e.g. 8")}${field("Gender", "select", "", { required: true, options: ["Select gender", "Male", "Female", "Other"] })}${field("Date of birth", "date")}${field("Phone number", "tel", "+91 98765 43210", { required: true })}${field("Email", "email", "doctor@clinic.com", { required: true })}${field("Medical registration number", "text", "e.g. TNMC/12345")}${field("Qualification", "text", "e.g. MBBS, MD")}${field("PAN", "text", "ABCDE1234F")}${field("PAN document", "file", "", { accept: "image/*,.pdf" })}${field("Aadhaar", "text", "12 digit number")}${field("Aadhaar document", "file", "", { accept: "image/*,.pdf" })}${field("Clinic / Hospital Name", "text", "e.g. City Care Hospital")}${field("Status (edit only)", "select", "", { options: ["Active", "Inactive"] })}${field("Address", "textarea", "Clinic / correspondence address", { wide: true })}</div><p class="wf-help">Save as Draft permits an incomplete profile; final creation requires name, specialization, gender, phone and email.</p><div class="wf-actions" style="margin-top:12px">${button("Cancel")}${button("Save as Draft")}${button("Create Doctor", "primary")}</div>`))}
        ${section("Bulk assignment dialog", panel(`<p class="wf-help">The selected doctor list is shown here; each doctor receives a separate link. No email is sent from this action.</p><div class="wf-list-row"><span>Sending to · 2 doctors</span><strong>Dr. Ananya Rao · Dr. Kiran Shah</strong></div><div class="wf-grid wf-grid--2" style="margin-top:12px">${field("Form", "select", "", { required: true, options: ["Select a form", "Doctor Onboarding"] })}${field("Employee who shares the links", "select", "", { required: true, options: ["Select an employee", "Asha Kumar · PT-014"] })}${field("Approval chain direction", "select", "", { options: ["Top → employee (root first)", "Employee → top (reporting line up)"] })}${field("Due date", "date")}${field("Instructions", "textarea", "Optional note with {{doctor.name}} style placeholders", { wide: true })}</div><div class="wf-actions" style="margin-top:12px">${button("Cancel")}${button("Assign to 2 doctors", "primary")}</div>`))}
      </div>`,
  },
  {
    id: "doctor-details", group: "Workspace", title: "Doctor Details", route: "/app/doctors/:doctorId",
    access: "Users with doctor.view",
    description: "Full doctor identity and contact profile alongside assigned compliance forms, completion, approval chain and actions.",
    body: () => `
      <div class="wf-body">
        <div class="wf-breadcrumb"><button data-screen="doctors">Doctor directory</button><span>/</span><span>Doctor details</span></div>
        <div class="wf-panel"><div class="wf-inline"><span class="wf-symbol">AR</span><div><h2 class="wf-panel-title">Dr. Ananya Rao</h2><p class="wf-help">Cardiology · 8 yrs experience · City Care Hospital · Doctor ID DOC-001</p></div><div style="margin-left:auto">${status("Active", "good")}</div></div></div>
        <div class="wf-grid wf-grid--split">
          ${section("Personal details", `<div class="wf-panel"><div class="wf-list">${["Age · 38 yrs", "Gender · Female", "Date of birth · 1988-04-12", "Phone number · +91 98765 43210", "Email · ananya@clinic.test", "PAN · ABCDE1234F", "Aadhaar · •••• •••• 1234", "Medical reg. no. · TNMC/12345", "Qualification · MBBS, MD", "Clinic / Hospital · City Care Hospital", "Address · 14 Health Park, Chennai", "Added by · Asha Kumar", "Last updated · 2026-10-18"].map((x) => `<div class="wf-list-row"><span>${x.split(" · ")[0]}</span><strong>${x.split(" · ").slice(1).join(" · ")}</strong></div>`).join("")}</div></div>`)}
          ${section("Compliance forms", `<div class="wf-card"><div class="wf-card-head"><h3>Doctor onboarding</h3>${status("In approval", "warn")}</div><p>FORM · assigned 2026-10-12 · due 2026-10-30</p><div class="wf-list">${["Managed by · Asha Kumar", "Template · New Doctor Agreement", "Submitted by doctor · 2026-10-14 10:22", "Approval level · Step 2 of 3", "Progress · 8 of 10 answers"].map((x) => `<div class="wf-list-row"><span>${x.split(" · ")[0]}</span><strong>${x.split(" · ").slice(1).join(" · ")}</strong></div>`).join("")}</div><div class="wf-mini-bar"><span style="width:80%"></span></div><div class="wf-tree-children"><div class="wf-tree-node"><span>Step 1 · Regional Lead · Asha Kumar</span>${status("Approved", "good")}</div><div class="wf-tree-node"><span>Step 2 · Tenant Admin · N. Kumar</span>${status("Pending", "warn")}</div><div class="wf-tree-node"><span>Step 3 · Super Admin</span>${status("Waiting")}</div></div><div class="wf-actions" style="margin-top:12px">${button("Delete workflow", "danger")}${button("Copy link")}${button("Regenerate link")}${button("Open PDF")}</div></div>`)}
        </div>
        <div class="wf-actions">${button("Edit Doctor")}${button("Assign Form", "primary")}${button("Delete", "danger")}</div>
        ${section("Assign compliance form dialog", panel(`<div class="wf-grid wf-grid--2">${field("Form", "select", "", { required: true, options: ["Select a form", "Doctor onboarding"] })}${field("Employee who shares the link", "select", "", { required: true, options: ["Select an employee", "Asha Kumar · PT-014"] })}${field("Approval chain", "select", "", { options: ["Top → employee (root first)", "Employee → top (reporting line up)"] })}${field("Due date", "date")}${field("Instructions", "textarea", "Optional note the employee passes on to the doctor", { wide: true })}</div><div class="wf-actions" style="margin-top:12px">${button("Cancel")}${button("Assign Form", "primary")}</div>`))}
      </div>`,
  },
  {
    id: "forms-builder", group: "Workflow setup", title: "Forms · Builder", route: "/app/forms",
    access: "Super admin / tenant admin",
    description: "Create published or draft schema forms, configure agreement attachment, add questions, choose field behavior and manage organization signing data.",
    body: () => `
      <div class="wf-body">
        <div class="wf-tabs" role="tablist"><button class="wf-tab" aria-selected="true">Builder</button><button class="wf-tab" data-screen="form-templates">Templates</button><button class="wf-tab" data-screen="signature-templates">Signature templates</button></div>
        <div class="wf-grid wf-grid--2">
          ${section("Workspace", panel(`${field("Existing forms", "select", "", { options: ["Create new form", "Doctor Onboarding", "Annual Compliance"] })}${check("Raw JSON")}${field("Raw schema JSON", "textarea", "{ schema: { fields: [...] } }", { wide: true })}`))}
          ${section("Form setup", panel(`<div class="wf-grid">${field("Form title", "text", "New form", { required: true })}${field("Publish form", "select", "", { options: ["Published", "Draft"] })}${field("Description", "textarea", "Please fill this form.", { wide: true })}${field("Submit button label", "text", "Submit")}${field("Success message", "textarea", "Thanks. Your response has been received.")}${field("Agreement — template", "select", "", { options: ["No agreement", "Doctor onboarding agreement"] })}</div><div class="wf-actions" style="margin-top:12px">${check("Allow draft responses")}</div>`))}
        </div>
        ${section("Questions", `<div class="wf-actions" style="margin-bottom:10px">${button("+ Add question", "primary")}</div>
          ${["Full Name · Short answer · Required", "Email · Email · Required"].map((title, i) => `<article class="wf-question"><div class="wf-question-head"><strong>${title}</strong><span class="wf-question-tools">${button("↑", "small")}${button("↓", "small")}${button("Duplicate", "small")}${button("Delete", "small")}</span></div><div class="wf-grid wf-grid--3">${field("Question title", "text", "", { value: title.split(" · ")[0] })}${field("Type", "select", "", { options: ["Short answer", "Paragraph", "Email", "Phone", "Number", "Date", "Dropdown", "Multiple choice", "Checkboxes", "File upload"] })}${field("Width", "select", "", { options: ["Full width", "Half width"] })}${check("Required")}${field("Placeholder", "text", "Enter your answer")}${field("Options (select / radio / checkboxes)", "text", "Option 1, Option 2")}${field("Allowed file types", "text", "image/*,application/pdf")}</div></article>`).join("")}`)}
        ${section("Form preview", panel(`<div class="wf-grid wf-grid--2">${field("Full Name", "text", "Enter your answer", { required: true })}${field("Email", "email", "Enter your email", { required: true })}</div><div class="wf-actions" style="margin-top:12px">${button("Submit", "primary")}</div>`))}
        ${section("Organization data · Party 1", panel(`<div class="wf-grid wf-grid--3">${field("Organization name", "text", "", { disabled: true })}${field("Organization code", "text", "", { disabled: true })}${field("Email", "email")}${field("Phone", "tel")}${field("Address", "textarea", "", { wide: true })}${field("Registration no.", "text")}${field("Party 1 signature", "file", "", { accept: "image/*" })}${field("Signature capture mode", "select", "", { options: ["Upload", "Draw on signature pad"] })}${field("Party 1 stamp / seal", "file", "", { accept: "image/*" })}</div><div class="wf-actions" style="margin-top:12px">${button("Remove signature")}${button("Remove stamp")}${button("Save organization data", "primary")}</div>`))}
      </div>`,
  },
  {
    id: "form-templates", group: "Workflow setup", title: "Forms · Agreement templates", route: "/app/forms · Templates tab",
    access: "Super admin / tenant admin",
    description: "Maintain reusable agreement text. Template tags resolve organization, doctor and date values; unknown tags become editable required fields.",
    body: () => `
      <div class="wf-body">
        <div class="wf-tabs" role="tablist"><button class="wf-tab" data-screen="forms-builder">Builder</button><button class="wf-tab" aria-selected="true">Templates</button><button class="wf-tab" data-screen="signature-templates">Signature templates</button></div>
        ${section("Agreement templates", `<div class="wf-actions" style="margin-bottom:12px">${button("+ Add template", "primary")}</div><div class="wf-card-list">${["Doctor onboarding agreement", "Annual compliance terms"].map((n) => `<article class="wf-card"><div class="wf-card-head"><h3>${n}</h3>${status("Saved")}</div><p>Party fields · doctor.name · tenant.name · date</p><div class="wf-actions" style="margin-top:12px">${button("Edit")}${button("Delete", "danger")}</div></article>`).join("")}</div>`)}
        ${section("Create / edit template dialog", `<div class="wf-builder-layout">${panel(`<div class="wf-grid">${field("Template name", "text", "Agreement name", { required: true })}${field("Upload agreement document", "file", "", { accept: ".txt,.md,.docx,.pdf" })}${field("Agreement body", "textarea", "Paste the agreement text here. Use {{tenant.name}}, {{doctor.name}}, {{date}} and custom tags.", { wide: true })}${field("Party fields", "select", "", { options: ["Doctor fields", "Organization fields", "Date / shared fields"] })}</div><div class="wf-checks" style="margin-top:12px">${check("Party 1")}${check("Party 2")}</div><div class="wf-actions" style="margin-top:12px">${button("Detect required fields")}${button("Save template", "primary")}</div>`)}${panel(`<h3 class="wf-panel-title">Agreement preview</h3><div class="wf-preview-sheet"><h3>Doctor onboarding agreement</h3><p>This agreement is between {{tenant.name}} and {{doctor.name}}.</p><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-sign"><span>Party 1 · {{signature.tenant}}</span><span>Party 2 · {{signature.doctor}}</span></div></div><div class="wf-rule"></div><div class="wf-grid">${field("Custom field · {{custom.term}}", "text", "Enter value")}</div>`)}
        </div>`, "Editable fields generated from unknown/custom tags are listed below the template body.")}
      </div>`,
  },
  {
    id: "signature-templates", group: "Workflow setup", title: "Forms · Signature templates", route: "/app/forms · Signature templates tab",
    access: "Super admin / tenant admin",
    description: "Upload a PDF or DOCX, position agreement fields on the document, preview the layout, and send signature requests to a doctor.",
    body: () => `
      <div class="wf-body">
        <div class="wf-tabs"><button class="wf-tab" data-screen="forms-builder">Builder</button><button class="wf-tab" data-screen="form-templates">Templates</button><button class="wf-tab" aria-selected="true">Signature templates</button></div>
        ${section("Saved signature templates", `<div class="wf-actions" style="margin-bottom:12px">${button("+ Add template", "primary")}</div><div class="wf-card-list">${["Doctor onboarding agreement", "Service agreement"].map((x) => `<article class="wf-card"><h3>${x}</h3><p>PDF · 4 pages · 6 fields configured</p><div class="wf-actions" style="margin-top:12px">${button("Edit")}${button("Send")}${button("Delete", "danger")}</div></article>`).join("")}</div>`)}
        ${section("Signature template designer", `<div class="wf-toolbar">${field("Agreement name", "text", "Doctor onboarding agreement")}${field("Upload / replace document", "file", "", { accept: ".pdf,.docx" })}${button("Save layout", "primary")}</div><div class="wf-builder-layout"><aside class="wf-panel"><h3 class="wf-panel-title">Field library · drag onto document</h3><p class="wf-help">Party 2 · signer fields</p><div class="wf-list">${["Party 2 signature · signature.doctor", "Party 2 name · doctor.name", "Party 2 address · doctor.address", "Party 2 text field · custom.party2_text", "Date · date"].map((x) => `<div class="wf-list-row">${x}${button("Add", "small")}</div>`).join("")}</div><p class="wf-help">Party 1 · organization fields</p><div class="wf-list">${["Party 1 name · tenant.name", "Party 1 address · tenant.address", "Party 1 text · tenant.custom", "Party 1 signature · signature.tenant", "Party 1 stamp · stamp"].map((x) => `<div class="wf-list-row">${x}${button("Add", "small")}</div>`).join("")}</div>${field("Organization stamp", "file", "", { accept: "image/*" })}</aside><div class="wf-panel"><div class="wf-section-head"><h3>Agreement preview · page 1 / 4</h3>${button("Previous page", "small")}${button("Next page", "small")}</div><div class="wf-preview-sheet"><h3>Service Agreement</h3><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--short"></div><div class="wf-preview-sign"><span>Party 1 name · signature · stamp</span><span>Party 2 name · signature</span></div></div></div></div>`)}
        ${section("Selected field properties", panel(`<div class="wf-grid wf-grid--3">${field("Tag", "text", "", { value: "doctor.name", disabled: true })}${field("Type", "text", "", { value: "TEXT", disabled: true })}${field("Label", "text", "Party 2 name")}${field("Party 1 text value", "textarea", "Enter the value to print for Party 1")}${field("Required", "select", "", { options: ["Optional", "Required"] })}${field("Page", "number", "1")}${field("Visible to", "select", "", { options: ["Party 1", "Party 2", "Both"] })}</div><div class="wf-actions" style="margin-top:12px">${button("Delete selected field", "danger")}</div>`))}
        ${section("Send signature request", panel(`<div class="wf-grid wf-grid--2">${field("Doctor (Party 2)", "select", "", { required: true, options: ["Select doctor", "Dr. Ananya Rao"] })}${field("Agreement title", "text", "Doctor onboarding agreement")}</div><div class="wf-actions" style="margin-top:12px">${button("Send agreement", "primary")}${button("Copy signing link")}</div>`))}
      </div>`,
  },
  {
    id: "kyc", group: "Workflow operations", title: "KYC", route: "/app/kyc",
    access: "Users with KYC or workflow submit permission",
    description: "Create external customer/vendor records, send Aadhaar or PAN verification links, inspect verified data and update contacts.",
    body: () => `
      <div class="wf-body">
        ${section("Create external user", panel(`<div class="wf-grid wf-grid--2">${field("Type", "select", "", { required: true, options: ["Customer", "Vendor", "Partner", "Other"] })}${field("Name", "text", "Full name", { required: true })}${field("Email", "email", "user@example.com", { required: true })}${field("Phone (optional)", "tel", "+91 98765 43210")}</div><div class="wf-actions" style="margin-top:12px">${button("Create External User", "primary")}</div>`))}
        ${section("External users", table(["Name", "Email", "Type", "Aadhaar", "PAN", "Verified details", "KYC status", "Created by", "Actions"], [
          ["Riya Shah", "riya@example.test", "Customer", status("Verified", "good"), status("Pending", "warn"), "Name · address · DOB", status("In progress", "warn"), "Asha Kumar", rowActions("Edit", "Delete")],
          ["Northwind Supplies", "ops@northwind.test", "Vendor", status("Not started"), status("Verified", "good"), "Legal name · PAN", status("Complete", "good"), "N. Kumar", rowActions("Edit", "Delete")],
        ]))}
        ${section("Send OTP link", panel(`<div class="wf-grid wf-grid--2">${field("External user", "select", "", { required: true, options: ["Select external user", "Riya Shah (riya@example.test)"] })}${field("Verification type", "select", "", { required: true, options: ["Aadhaar OTP", "PAN OTP"] })}</div><div class="wf-actions" style="margin-top:12px">${button("Send OTP Link", "primary")}</div>`))}
        ${section("Public verification page", panel(`<div class="wf-grid wf-grid--2">${field("Document", "select", "", { options: ["AADHAAR", "PAN"] })}${field("OTP from email", "text", "Enter OTP", { required: true })}${field("Full name (as on Aadhaar)", "text", "", { required: true })}${field("Aadhaar number (12 digits)", "text", "", { required: true })}${field("Mobile number", "tel", "10-digit mobile", { required: true })}${field("Email", "email", "", { required: true })}</div><div class="wf-note" style="margin-top:12px">For PAN verification, the document-specific field is PAN (10 characters); Aadhaar-only fields are hidden.</div><div class="wf-actions" style="margin-top:12px">${button("Verify and submit", "primary")}</div>`))}
        ${section("External user details drawer", panel(`<div class="wf-grid wf-grid--2">${field("Type", "text", "", { value: "Customer", disabled: true })}${field("KYC record", "text", "", { value: "kyc_02f8…", disabled: true })}${field("Aadhaar status", "text", "", { value: "Verified", disabled: true })}${field("PAN status", "text", "", { value: "Pending", disabled: true })}${field("Overall status", "text", "", { value: "In progress", disabled: true })}${field("Verified details", "text", "", { value: "Name, address, date of birth", disabled: true })}${field("Created by", "text", "", { value: "Asha Kumar", disabled: true })}${field("Name", "text", "Full name", { required: true })}${field("Email", "email", "", { required: true })}${field("Phone", "tel")}</div><div class="wf-actions" style="margin-top:12px">${button("Save changes", "primary")}${button("Close")}${button("Delete", "danger")}</div>`))}
      </div>`,
  },
  {
    id: "notifications", group: "Workflow operations", title: "Notifications", route: "/app/notifications",
    access: "All signed-in users; composing depends on notification permission",
    description: "Compose in-app or email messages to allowed recipients and review sent/received activity, attachments, channel and status.",
    body: () => `
      <div class="wf-body">
        ${section("New message", panel(`<p class="wf-help">Recipients · 5 available · admins can message active employees; other users see leadership and tenant admins.</p><div class="wf-grid wf-grid--2" style="margin-top:10px"><div class="wf-choice-list">${["Asha Kumar · asha@company.test", "Ravi Menon · ravi@company.test", "Leela Joseph · leela@company.test"].map((x) => `<label class="wf-choice"><input type="checkbox">${x}</label>`).join("")}</div>${panel(`<p class="wf-panel-title">Selected recipients</p><p class="wf-help">Choose one or more people above.</p>`, "soft")}</div><div class="wf-grid wf-grid--2" style="margin-top:14px">${field("Subject", "text", "Optional subject")}${field("Channel", "select", "", { options: ["In-app", "Email"] })}${field("Message", "textarea", "Your message", { required: true, wide: true })}</div><div class="wf-actions" style="margin-top:12px">${button("Send to selected", "primary")}${button("Refresh recipient list")}</div>`))}
        ${section("Inbox / activity", table(["When", "From", "To", "Subject", "Attachment", "Message", "Channel", "Status"], [
          ["2026-10-21 10:12", "Asha Kumar", "Ravi Menon", "Form needs review", "PDF · Form link", "Please review the submitted agreement…", "In-app", status("Delivered", "good")],
          ["2026-10-20 15:08", "Platform", "Asha Kumar", "Invitation", "—", "Your invite is ready…", "Email", status("Read")],
        ]))}
      </div>`,
  },
  {
    id: "audit", group: "Workflow operations", title: "Audit Logs", route: "/app/audit",
    access: "Users with audit.view",
    description: "Paginated, immutable audit log with total count, current page, actor, action, time and source IP.",
    body: () => `
      <div class="wf-body">
        <div class="wf-inline">${panel(`<div class="wf-inline"><span>Total events</span><strong>248</strong></div>`, "soft")}${button("Previous page")}${panel(`<span>Page 1 / 13</span>`, "soft")}${button("Next page")}</div>
        ${section("Audit events", table(["At", "Action", "User", "IP"], [
          ["2026-10-21 10:12:38", "FORM_DISPATCH_APPROVED", "asha@company.test", "203.0.113.18"],
          ["2026-10-21 09:44:12", "DOCTOR_UPDATED", "admin@company.test", "203.0.113.22"],
          ["2026-10-20 18:05:01", "TENANT_CREATED", "superadmin@pinktech.test", "198.51.100.4"],
        ]))}
      </div>`,
  },
  {
    id: "workflow-tracking", group: "Workflow operations", title: "Workflow tracking", route: "Source module · not currently routed",
    access: "Approvers / workflow managers",
    description: "Implemented workflow tracking module in the source tree; this is not currently connected to a route in App.jsx.",
    unrouted: true,
    body: () => `
      <div class="wf-body"><div class="wf-note">Source status: implemented component, not wired to the active router. The live app currently exposes related external-user KYC actions from the KYC page.</div>
        ${section("External form pipeline", table(["Sent", "Form", "External user", "Status", "Chain progress", "Sent by", "PDF", "Activity"], [
          ["2026-10-20 14:30", "Doctor onboarding", "riya@example.test", status("In approval", "warn"), `<div class="wf-mini-bar"><span style="width:66%"></span></div><small class="wf-cell-meta">2 of 3 approved · step 3 waiting</small>`, "PT-014", button("Open", "small"), button("Activity log (4)", "small")],
          ["2026-10-19 10:11", "Annual compliance", "doctor@example.test", status("Approved", "good"), `<div class="wf-mini-bar"><span style="width:100%"></span></div>`, "PT-018", button("Open", "small"), button("Activity log (7)", "small")],
        ]))}
        ${section("Activity log dialog", panel(`<div class="wf-list">${["2026-10-20 14:30 · DISPATCH_SENT · Sent by Asha Kumar", "2026-10-20 16:00 · FORM_SUBMITTED · External user", "2026-10-21 09:22 · APPROVAL_STEP_COMPLETED · Level 1", "2026-10-21 10:00 · APPROVAL_PENDING · Level 2"].map((x) => `<div class="wf-list-row">${x}</div>`).join("")}</div><details style="margin-top:10px"><summary>Raw JSON</summary><pre class="wf-mono">[eventLog entries]</pre></details>${button("Close")}`))}
      </div>`,
  },
  {
    id: "approvals", group: "Workflow operations", title: "Form approvals", route: "Source module · not currently routed",
    access: "Current approver in a reporting chain",
    description: "Implemented approval inbox in the source tree; it is not currently connected to a route in App.jsx.",
    unrouted: true,
    body: () => `
      <div class="wf-body"><div class="wf-note">Source status: implemented component, not wired to the active router.</div>
        ${section("Waiting on your approval", table(["Dispatch sent", "Form", "External user", "Sent by", "Your step / chain", "PDF", "Actions"], [
          ["2026-10-21 09:32", "Doctor onboarding", "riya@example.test", "PT-014", "Step 2 of 3 · 1 of 3 done", button("Open", "small"), rowActions("Approve", "Reject")],
          ["2026-10-20 17:04", "Annual compliance", "doctor@example.test", "PT-021", "Step 1 of 2 · 0 of 2 done", button("Open", "small"), rowActions("Approve", "Reject")],
        ]))}
        ${section("Empty state", panel(`<div class="wf-empty">Nothing waiting on you right now.</div>`))}
      </div>`,
  },
  {
    id: "assignments", group: "Workflow operations", title: "Assignments", route: "Source module · not currently routed",
    access: "Tenant users with assignment access",
    description: "Implemented employee-to-position assignment module in the source tree; it is not currently connected to a route in App.jsx.",
    unrouted: true,
    body: () => `
      <div class="wf-body"><div class="wf-note">Source status: implemented component, not wired to the active router. Org Explore is the active place for directory and seat operations.</div>
        ${section("Assign a person to a position", panel(`<div class="wf-grid wf-grid--3">${field("Employee", "select", "", { required: true, options: ["Select employee", "PT-014 — Asha Kumar (asha@company.test)"] })}${field("Position", "select", "", { required: true, options: ["Select position", "Regional Lead — L2"] })}${button("Assign", "primary")}</div>`))}
        ${section("Assignments", table(["ID", "Employee", "Position", "Status", "Active from"], [
          ["as_021…", "PT-014 — Asha Kumar (asha@company.test)", "Regional Lead (pos_02…)", status("Active", "good"), "2026-01-14"],
          ["as_05c…", "PT-021 — Ravi Menon (ravi@company.test)", "Field Executive (pos_06…)", status("Active", "good"), "2026-02-03"],
        ]))}
      </div>`,
  },
  {
    id: "login", group: "Identity & access", title: "Sign in", route: "/login",
    access: "Public",
    description: "Workspace sign-in, password recovery and invite verification entry points.",
    body: () => `
      <div class="wf-body"><div class="wf-grid wf-grid--split">${panel(`<p class="wf-overline">Pinktech workspace</p><h2 class="wf-panel-title" style="font-size:25px;margin-top:12px">Work moves forward.</h2><p class="wf-help">Profiles, documents and signatures in one connected workspace.</p><div class="wf-preview-sheet" style="margin-top:18px"><h3>A clearer path from intake to signature.</h3><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div></div>`)}${panel(`<div class="wf-breadcrumb"><button data-screen="landing">Back to Pinktech</button></div><h2 class="wf-panel-title" style="font-size:22px">Welcome back.</h2><p class="wf-help" style="margin-bottom:16px">Sign in with your invite credentials to access your tenant workspace.</p><div class="wf-body">${field("Email", "email", "", { required: true })}${field("Password", "password", "", { required: true })}${button("Sign in", "primary")}<div class="wf-inline"><button class="wf-button" data-screen="forgot-password">Forgot password?</button><button class="wf-button" data-screen="verify-otp">Verify invite OTP</button></div></div>`)}
      </div></div>`,
  },
  {
    id: "verify-otp", group: "Identity & access", title: "Verify invite OTP", route: "/verify-otp",
    access: "Invited employee",
    description: "Confirm the work email and six-digit one-time code from the invitation email before choosing a password.",
    body: () => `<div class="wf-body" style="max-width:520px">${panel(`<h2 class="wf-panel-title">Verify Invite OTP</h2><p class="wf-help">Use the email address from your invitation.</p><div class="wf-body" style="margin-top:16px">${field("Work email (from invite)", "email", "", { required: true })}${field("6-digit OTP", "text", "000000", { required: true })}${button("Verify OTP", "primary")}<button class="wf-button" data-screen="login">Back to login</button></div>`)}</div>`,
  },
  {
    id: "set-password", group: "Identity & access", title: "Set password", route: "/set-password",
    access: "Verified invite",
    description: "Create a password after OTP verification; invite token is carried through the flow.",
    body: () => `<div class="wf-body" style="max-width:520px">${panel(`<h2 class="wf-panel-title">Set Password</h2><p class="wf-help">After verifying your OTP, set your password below.</p><div class="wf-body" style="margin-top:16px">${field("Sign-in email", "email", "")}${field("New password (min 8 characters)", "password", "", { required: true })}${field("Confirm password", "password", "", { required: true })}${button("Save Password", "primary")}<button class="wf-button" data-screen="login">Back to login</button></div>`)}</div>`,
  },
  {
    id: "forgot-password", group: "Identity & access", title: "Forgot password", route: "/forgot-password",
    access: "Public",
    description: "Request a password reset using the account email.",
    body: () => `<div class="wf-body" style="max-width:520px">${panel(`<h2 class="wf-panel-title">Forgot Password</h2><p class="wf-help">Enter your account email to request a reset.</p><div class="wf-body" style="margin-top:16px">${field("Email", "email", "", { required: true })}${button("Send reset link", "primary")}<button class="wf-button" data-screen="login">Back to login</button></div>`)}</div>`,
  },
  {
    id: "reset-password", group: "Identity & access", title: "Reset password", route: "/reset-password",
    access: "Reset link holder",
    description: "Apply the reset token and create a new password.",
    body: () => `<div class="wf-body" style="max-width:520px">${panel(`<h2 class="wf-panel-title">Reset Password</h2><div class="wf-body" style="margin-top:16px">${field("Reset token", "text", "", { required: true })}${field("New password", "password", "", { required: true })}${button("Reset Password", "primary")}</div>`)}</div>`,
  },
  {
    id: "public-form", group: "Public submissions", title: "Public schema form", route: "/public/schema-forms/:moduleId",
    access: "Anyone with a valid form URL",
    description: "Form is dynamically rendered from its schema: title, description, required state, field type, width and configured options.",
    body: () => `
      <div class="wf-body" style="max-width:860px;margin-inline:auto">
        ${panel(`<p class="wf-overline">Apixey Private Limited</p><h2 class="wf-panel-title" style="font-size:24px;margin-top:8px">Doctor onboarding</h2><p class="wf-help">Please complete each required field. Your response is securely attached to this workflow.</p><div class="wf-grid wf-grid--2" style="margin-top:18px">${field("Full Name", "text", "Enter your full name", { required: true })}${field("Email", "email", "name@example.com", { required: true })}${field("Phone number", "tel", "+91…")}${field("Date of birth", "date")}${field("Specialization", "select", "", { options: ["Choose…", "Cardiology", "Pediatrics", "General medicine"] })}${field("Registration number", "text", "Medical registration no.")}${field("Professional address", "textarea", "", { wide: true })}${field("Supporting document", "file", "", { accept: "image/*,.pdf" })}<div class="wf-field wf-field--wide"><span>Agreement</span><div class="wf-preview-sheet"><h3>Terms of engagement</h3><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-sign"><span>Organization</span><span>Doctor signature</span></div></div></div>${field("Signature input", "select", "", { options: ["Draw signature", "Upload image"] })}${field("Signature file", "file", "", { accept: "image/*" })}</div><div class="wf-actions" style="margin-top:16px">${check("I confirm the information above is accurate.")}${button("Submit", "primary")}${button("Save draft")}</div>`)}
        ${section("Submission states", `<div class="wf-card-list">${["Submission received · PDF is being prepared", "Response saved · Download PDF", "Form unavailable · Check the link or ask the sender"].map((x) => `<div class="wf-card"><p>${x}</p></div>`).join("")}</div>`)}
      </div>`,
  },
  {
    id: "public-dispatch", group: "Public submissions", title: "Dispatched form", route: "/public/schema-forms/dispatch/:token",
    access: "External user with a dispatch link",
    description: "Instructions, dynamically configured form questions, agreement/signature fields, submission state and generated PDF outcome.",
    body: () => `
      <div class="wf-body" style="max-width:860px;margin-inline:auto">
        ${panel(`<p class="wf-overline">Northstar Health</p><h2 class="wf-panel-title" style="font-size:24px;margin-top:8px">Doctor onboarding</h2><div class="wf-note" style="margin:12px 0">Instructions from Asha: Please complete the profile and attach your current registration certificate.</div><div class="wf-grid wf-grid--2">${field("Full Name", "text", "Enter your name", { required: true })}${field("Email", "email", "", { required: true })}${field("Specialization", "select", "", { options: ["Select", "Cardiology", "Pediatrics"] })}${field("Years of experience", "number")}${field("PAN", "text")}${field("Aadhaar", "text")}${field("Upload registration certificate", "file", "", { accept: "application/pdf,image/*" })}${field("Effective date", "date")}</div><div class="wf-preview-sheet" style="margin-top:15px"><h3>Agreement / signature</h3><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-sign"><span>Party 1 · Organization signature</span><span>Party 2 · Doctor signature</span></div></div><div class="wf-actions" style="margin-top:15px">${button("Submit response", "primary")}</div>`)}
        ${section("Post-submit states", panel(`<div class="wf-list"><div class="wf-list-row"><span>First submit</span><strong>Submission received · Your response is saved. Your PDF is being prepared.</strong></div><div class="wf-list-row"><span>PDF ready</span><strong>Download completed form</strong></div><div class="wf-list-row"><span>Processing error</span><strong>Response saved · Retry PDF preparation</strong></div></div>`))}
      </div>`,
  },
  {
    id: "public-kyc", group: "Public submissions", title: "KYC OTP verification", route: "/public/kyc-verify",
    access: "External user with verification email",
    description: "Verify Aadhaar or PAN using the email OTP and document-specific identity fields. The email link can lock document type.",
    body: () => `
      <div class="wf-body" style="max-width:600px;margin-inline:auto">${panel(`<h2 class="wf-panel-title" style="font-size:22px">Verify Aadhaar OTP</h2><p class="wf-help">Use the link from your email and the OTP from the same message.</p><div class="wf-body" style="margin-top:16px">${field("Document", "select", "", { options: ["AADHAAR", "PAN"] })}${field("OTP from email", "text", "", { required: true })}${field("Full name (as on Aadhaar)", "text", "", { required: true })}${field("Aadhaar number (12 digits)", "text", "", { required: true })}${field("Mobile number", "tel", "10-digit mobile", { required: true })}${field("Email", "email", "", { required: true })}${button("Verify and submit", "primary")}</div><div class="wf-rule"></div><p class="wf-help">PAN variant: Document = PAN, OTP from email, PAN (10 characters), Verify and submit.</p></div>`)}</div>`,
  },
  {
    id: "public-sign", group: "Public submissions", title: "Sign agreement", route: "/sign/:token",
    access: "Doctor / signer with a signing link",
    description: "Review agreement PDF, fill signer-owned fields, draw signature, accept electronic-sign consent, then sign or decline with a reason.",
    body: () => `
      <div class="wf-body" style="max-width:1000px;margin-inline:auto">${panel(`<h2 class="wf-panel-title" style="font-size:23px">Doctor onboarding agreement</h2><p class="wf-help">Review the agreement below. Place any missing values, then draw your signature.</p><div class="wf-preview-sheet" style="min-height:380px;margin-top:14px"><h3>Agreement document · page 1</h3><div class="wf-preview-line"></div><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--mid"></div><div class="wf-preview-line"></div><div class="wf-preview-line wf-preview-line--short"></div><div class="wf-preview-line"></div><div class="wf-preview-sign"><span>Organization signature</span><span>Doctor name · signature field</span></div></div><div class="wf-grid wf-grid--2" style="margin-top:14px">${field("Party 2 name", "text", "Your full name")}${field("Party 2 address", "textarea", "Your address")}</div><div class="wf-rule"></div><h3 class="wf-panel-title">Your signature</h3><p class="wf-help">Draw below, then confirm.</p><div class="wf-dialog-preview" style="margin:10px 0">${button("Draw signature")}${button("Clear signature")}</div><div class="wf-actions">${check("I consent to sign electronically.")}${button("Sign agreement", "primary")}${button("Decline")}</div><div class="wf-grid" style="margin-top:12px">${field("Reason for declining", "textarea", "Reason for declining")}${button("Confirm decline", "danger")}</div>`)}
        ${section("Completion states", panel(`<div class="wf-list"><div class="wf-list-row"><span>Complete</span><strong>Signed · Agreement is complete</strong></div><div class="wf-list-row"><span>Declined</span><strong>Agreement was declined</strong></div><div class="wf-list-row"><span>Unavailable</span><strong>Signing link is no longer available</strong></div></div>`))}
      </div>`,
  },
  {
    id: "system-states", group: "Identity & access", title: "Access & system states", route: "/access-denied · /404",
    access: "Public / denied users",
    description: "Fallback screens for permission denial, missing routes, invalid public links, loading and recoverable data errors.",
    body: () => `
      <div class="wf-body"><div class="wf-card-list">${[
        ["Access denied", "You do not have permission to access this page.", "Return to dashboard"],
        ["Page not found", "The requested page could not be found.", "Go to Pinktech"],
        ["Invalid public link", "This form or signing link is expired or unavailable.", "Contact the person who sent the link"],
        ["Loading", "Keep the final page frame visible; replace values with stable neutral placeholders."],
        ["Error", "Show the error inside the section that failed, explain what failed, and offer Retry."],
        ["Empty", "Keep the section title and frame; say what is missing and show the next useful action."],
      ].map(([title, text, action]) => `<article class="wf-card"><h3>${title}</h3><p>${text}</p>${action ? button(action, "small") : ""}</article>`).join("")}</div></div>`,
  },
];

const nav = $("#screen-nav");
const content = $("#screen-content");
const sidebar = $("#screen-sidebar");
const search = $("#screen-search");
const toast = $("#wireframe-toast");
let activeScreen = "dashboard";
let toastTimer;

function renderNav(filter = "") {
  const normalized = filter.trim().toLowerCase();
  const groups = [...new Set(screens.map((screen) => screen.group))];
  nav.innerHTML = groups.map((group) => {
    const items = screens.filter((screen) => screen.group === group && `${screen.title} ${screen.route} ${screen.access}`.toLowerCase().includes(normalized));
    if (!items.length) return "";
    return `<div class="wf-nav-group"><p class="wf-nav-heading">${group}</p>${items.map((screen) => `
      <button class="wf-nav-item" type="button" data-screen="${screen.id}" aria-current="${activeScreen === screen.id ? "page" : "false"}">
        <span>${screen.title}</span>${screen.unrouted ? `<span class="wf-nav-tag">Source only</span>` : ""}
      </button>`).join("")}</div>`;
  }).join("");
}

function renderScreen(id) {
  const screen = screens.find((item) => item.id === id) || screens[0];
  activeScreen = screen.id;
  renderNav(search.value);
  const routeLabel = screen.unrouted ? "Not routed in current App.jsx" : screen.route;
  content.innerHTML = `
    <article class="wf-screen">
      <header class="wf-screen-head">
        <div>
          <p class="wf-overline">${screen.group} · ${screen.access}</p>
          <h1>${screen.title}</h1>
          <p>${screen.description}</p>
        </div>
        <div class="wf-screen-meta"><span class="wf-mono">${routeLabel}</span><br><span>Illustrative content · no backend actions</span></div>
      </header>
      ${screen.body()}
    </article>`;
  sidebar.classList.remove("is-open");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

document.addEventListener("click", (event) => {
  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    renderScreen(screenButton.dataset.screen);
    return;
  }
  const action = event.target.closest("[data-toast]");
  if (action) showToast(action.dataset.toast);
  const tab = event.target.closest(".wf-tab");
  if (tab) {
    const siblings = $$(".wf-tab", tab.parentElement);
    siblings.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    if (tab.dataset.screen) renderScreen(tab.dataset.screen);
  }
});

$("#menu-toggle").addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("is-open");
  $("#menu-toggle").setAttribute("aria-expanded", String(isOpen));
});

search.addEventListener("input", () => renderNav(search.value));
search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = $(".wf-nav-item", nav);
    if (first) renderScreen(first.dataset.screen);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === "Escape") sidebar.classList.remove("is-open");
});

renderNav();
renderScreen(activeScreen);
