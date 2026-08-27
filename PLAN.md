# Pink SaaS — Comprehensive Feature Plan

## Role Hierarchy
- **SuperAdmin (PinkTech)** — sees everything across all tenants
- **Tenant Admin** — sees everything within their tenant
- **Employees** — different levels in org tree (Level 1 → Level 2 → Level 3)
- **Users** — created by Level 1 employees only, no UI, just data records

---

## 1. Tenant Model + Backend Changes

### 1a. Tenant Model (`platform-service/src/models/tenant.model.js` + `auth-service/src/models/tenant.model.js`)
Add fields:
```
email          String, required   — admin email for credential delivery
isDemo         Boolean, default false  — marks demo tenant
formLimitPerLogin  Number, default 0  — 0 = unlimited, >0 = cap (demo = 5)
```

### 1b. Tenant Validator (`platform-service/src/validators/tenants.validator.js`)
- `createTenantSchema`: add `email` (required, email format)
- `updateTenantSchema`: add `email` (optional, email format)

### 1c. Tenant Service (`platform-service/src/services/tenants.service.js`)
- On create: store email, isDemo, formLimitPerLogin
- New action: `sendTenantCredentials(tenantId)` — generates/retrieves admin user, sends email with credentials
- On create: if isDemo tenant, auto-create demo admin user with default creds
- New action: `sendCreds(tenantId)` — resend credentials email

### 1d. Tenant Route (`platform-service/src/routes/tenants.route.js`)
- Add `POST /:tenantId/send-creds` — triggers credential email
- Add `POST /:tenantId/reset-creds` — resets password and sends new creds

### 1e. Demo Tenant Seed
- On first startup (or via seed script), create:
  - Tenant: `{ name: "Demo Tenant", code: "DEMO", email: "demo@pinktech.com", isDemo: true, formLimitPerLogin: 5 }`
  - Admin User: `{ name: "Demo Admin", email: "admin@demo.com", roleIds: [tenant-admin-role] }`
  - Default password: `Demo@123`

---

## 2. Tenant Management Page (Frontend)

### File: `frontend/src/modules/tenants/pages/TenantsPage.jsx`

#### Create Form (top of page)
```
[Name] [Code] [Email] [✓ Starter] [Create & Send Creds]
```

#### DataTable Columns
| Name | Code | Admin Email | Plan | Status | Actions |
|------|------|-------------|------|--------|---------|

#### Actions Column (4 buttons, side by side)
1. **Edit** — opens Edit Tenant modal
2. **Send Creds** — calls POST /tenants/:id/send-creds
3. **Deactivate/Activate** — toggle status (existing)
4. **Delete** — delete tenant (existing)

#### Edit Tenant Modal
Fields: Name, Code, Email, Plan (dropdown: starter/basic/pro/enterprise)
Save button PATCHes /tenants/:id

---

## 3. Employee Management Tab (NEW)

### 3a. Backend — New Route in auth-service
- `GET /users/managed` — list employees for the current tenant with their roles, filtered by permission
- `POST /users/:id/send-creds` — send credential email to employee
- `POST /users/:id/reset-creds` — reset employee password, send new creds

### 3b. Frontend — New Page
- **File**: `frontend/src/modules/users/pages/EmployeeManagementPage.jsx`
- **Route**: `/employee-management`
- **Permission**: `employee.manage`
- **Table Columns**: Name | Email | Emp ID | Roles | Status
- **Bulk Actions**: Select all checkbox, individual checkboxes
- **Action Buttons**: Send Creds (bulk), Reset Creds (bulk/individual)
- **Status filter tabs**: All | Active | Invited | Disabled

### 3c. Navigation
- Add to `access-control.js` NAV_SECTIONS under "Core" section
- Add route permission mapping

---

## 4. Org Employee Tab — 3 Mini Tabs

### File: `frontend/src/pages/OrgEmployeePage.jsx`

Replace iframe embed with 3 mini tabs:

#### Tab 1: Org Tree (permission: `employee.view`)
- Tree visualization of the organization hierarchy
- Shows reporting lines, employee levels
- Read-only view

#### Tab 2: Org Explorer (permission: `employee.edit`)
- Keep existing iframe embed to org-explorer
- Interactive editing of org structure

#### Tab 3: Role (permissions: `employee.assign`, `position.assign`, `position.create`, `position.update`)
- **Visibility**: Only shown if `employee.assign` is in user's permissions
- If `employee.assign` is NOT checked → this tab is completely hidden
- Content: Role assignment + position management (what's currently in RolesPage invite/assign flow)

#### Implementation
- Use React tabs (simple state-based, no library needed)
- Check `permissionCodes` to determine which tabs to show
- If user has `employee.view` → show Org Tree tab
- If user has `employee.edit` → show Org Explorer tab
- If user has `employee.assign` → show Role tab (and auto-check all position.* permissions)

---

## 5. Access Catalog Updates

### 5a. Permission Changes (`shared/src/constants/permissions.js`)
Add new permission:
```
{ code: "employee.manage", module: "employee", action: "manage", label: "Manage employees" }
```

Update permission labels for clarity:
```
employee.view    → "View org tree"        (Org Tree mini tab)
employee.edit    → "Edit org explorer"     (Org Explorer mini tab)
employee.assign  → "Manage roles & positions" (Role mini tab)
```

### 5b. Audit Scoping
- **SuperAdmin**: sees ALL audits across all tenants (no tenant filter)
- **Tenant Admin**: sees audits for their tenant only (filtered by tenantId)
- **Employees**: sees only their own audits (filtered by userId)
- Backend: modify `audit/logs` endpoint to apply scope based on role
- Frontend: AuditPage already works, no changes needed if backend scopes correctly

### 5c. Auth Login
- `auth.login` remains common for all characters
- Tenant creation now includes email → credentials sent via email
- Tenant uses those creds to log in

---

## 6. External Forms — Approval Order "Manager to Top"

### 6a. Backend
- New endpoint: `GET /kyc/approval-chain-preview/:managerId`
- Given a manager ID, returns the upward org tree from that manager
- Algorithm:
  1. Start with the manager
  2. Follow `reportingToUserId` upward until null (CEO/top)
  3. Return the chain: [manager, manager's manager, ..., top person]
- Existing `buildApprovalChain` function already does upward traversal — reuse it

### 6b. Frontend (`KycExternalFormsPage.jsx`)
- When approval order is set to "DEFAULT" (manager-to-top):
  - Show a manager selector dropdown
  - On select, fetch `/kyc/approval-chain-preview/:managerId`
  - Display the upward chain as a preview
  - Show only the people in this chain (not the entire org)

---

## 7. Form Limit for Demo Tenant

### Backend
- In forms-service, check `tenant.isDemo` and `tenant.formLimitPerLogin`
- Before creating a form module, count existing modules for this tenant
- If count >= formLimitPerLogin, reject with 403: "Demo tenant form limit reached"
- Frontend: show a banner/counter when in demo mode

---

## Implementation Order

### Phase 1: Backend Foundation
1. Update Tenant model (email, isDemo, formLimitPerLogin) — both platform-service and auth-service copies
2. Update tenant validator and service
3. Add send-creds and reset-creds endpoints
4. Add `employee.manage` permission to shared constants
5. Update audit endpoint with role-based scoping
6. Add demo tenant seed logic
7. Add form limit check in forms-service

### Phase 2: Tenant Management UI
8. Rewrite TenantsPage.jsx (create form + table + edit modal + actions)

### Phase 3: Employee Management
9. Create EmployeeManagementPage.jsx
10. Add route + nav + permissions

### Phase 4: Org Employee Tabs
11. Rewrite OrgEmployeePage.jsx with 3 tabs
12. Build/keep Org Tree, Org Explorer, Role tabs

### Phase 5: Approval Chain
13. Add manager-specific approval chain endpoint
14. Update KycExternalFormsPage with manager selector

### Phase 6: Polish
15. Audit scoping verification
16. Demo tenant form limit UX
17. Testing all flows

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/src/constants/permissions.js` | Add `employee.manage` |
| `services/platform-service/src/models/tenant.model.js` | Add email, isDemo, formLimitPerLogin |
| `services/auth-service/src/models/tenant.model.js` | Same |
| `services/platform-service/src/validators/tenants.validator.js` | Add email to schemas |
| `services/platform-service/src/services/tenants.service.js` | Send creds, demo seed, email field |
| `services/platform-service/src/routes/tenants.route.js` | Add send-creds, reset-creds |
| `services/auth-service/src/routes/users.route.js` | Add send-creds, reset-creds for employees |
| `services/auth-service/src/services/users.service.js` | Send creds logic |
| `services/forms-service/src/routes/schemaFormsBuilder.routes.js` | Form limit check |
| `frontend/src/modules/tenants/pages/TenantsPage.jsx` | Full rewrite |
| `frontend/src/modules/users/pages/EmployeeManagementPage.jsx` | NEW |
| `frontend/src/pages/OrgEmployeePage.jsx` | Rewrite with 3 tabs |
| `frontend/src/lib/access-control.js` | Add routes + permissions |
| `frontend/src/App.jsx` | Add /employee-management route |
| `frontend/src/modules/kyc/pages/KycExternalFormsPage.jsx` | Manager selector for approval chain |
