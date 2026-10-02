# NUTRIMAX Org Explorer · MERN edition

A full **MongoDB + Express + React + Node** stack that visualises the workbook hierarchy and lets you mutate it live (reassign managers, replace people, mark leavers, restore them, manage roles).

---

## Quick start

Prerequisites:

- **Node.js 18+** (you have 22.x)
- **MongoDB Community 6+** running locally on `mongodb://127.0.0.1:27017`. Any other URI works too — set `MONGO_URI` in `server/.env`.

Bootstrap the workspace once:

```
npm run install:all
```

Then start everything in one shot:

```
npm run dev
```

Or just double-click `start.bat` on Windows.

This brings up:

- **Express API** on http://127.0.0.1:4000
- **Vite/React UI** on http://localhost:5173 (the page you actually open)

The UI auto-creates a default tenant + admin and auto-imports `SAMPLE ORG (1).xlsx` on first launch — no login screen, no manual setup.

---

## What you get in the UI

**Org Explorer tab**

- Searchable directory with cascading filters (zone · region · state · HQ · role · level · vacant/filled).
- Interactive collapsible org tree of any selected person's subtree.
- Detail panel with the full record, ancestry breadcrumb, and action buttons:
  *Edit reporting line · Change role · Reassign reports · + Add direct report · Replace · Mark as left*.

**Roles tab**

- All discovered roles with auto-detected level + scope and editable overrides.
- Inline rename, "Reset all roles", "Re-detect from data", "+ Add role".
- Click any role's people count to expand a Members panel: per-person actions (Replace · Move under… · + Add new · Mark as left), search within the role.

**Header**

- Live counts (filled · vacant · roles · max level).
- Red "N removed" pill appears whenever someone is in the leavers queue — click it to restore.
- "Upload xlsx" + "Reload" buttons.

---

## Architecture

```
test/
├── server/                Express + Mongoose + role engine (TypeScript)
│   ├── src/
│   │   ├── app.ts / server.ts        Express bootstrap
│   │   ├── config/{db,env,rbac}.ts
│   │   ├── models/                   Tenant, User, Role, Position, Import, …
│   │   ├── services/
│   │   │   ├── role-engine.ts        Role discovery + level + scope inference
│   │   │   ├── xlsx-parser.ts        ExcelJS row reader
│   │   │   ├── position-builder.ts   Manager-name resolver, preserves overrides
│   │   │   ├── employee.service.ts   Directory/subtree/ancestry/stats/filters
│   │   │   ├── import.ts             Parse → build → engine
│   │   │   └── bootstrap.ts          Default tenant + admin + workbook auto-import
│   │   ├── controllers/              employees, hierarchy, roles, imports, …
│   │   ├── routes/                   employees, roles, imports, auth, tenants
│   │   └── middlewares/              auth, tenant, permission, error
│   └── scripts/
│       ├── validate.ts               In-memory MongoDB validation
│       └── _smoke_api.ts             Live HTTP smoke test (30 checks)
│
├── client/                React + Vite + Tailwind (TypeScript)
│   └── src/
│       ├── main.tsx                  React root + QueryClient + toaster
│       ├── App.tsx                   Tab switcher + modal root
│       ├── api/
│       │   ├── client.ts             fetch wrapper, JWT auto-bootstrap
│       │   ├── types.ts              Shapes mirroring backend
│       │   └── hooks.ts              TanStack Query hooks for every endpoint
│       ├── store/ui.ts               Zustand UI state (tab, selected, dialogs)
│       └── components/
│           ├── TopBar.tsx            Stat pills, tabs, upload/reload
│           ├── ExplorerView.tsx      3-column org explorer layout
│           ├── FilterBar.tsx         Cascading filters
│           ├── DirectoryList.tsx     Searchable people list
│           ├── OrgTree.tsx           Recursive tree visualisation
│           ├── DetailPanel.tsx       Detail + actions
│           ├── RolesView.tsx         Roles tab
│           ├── RolesTable.tsx        Inline-edit roles + expand
│           ├── MembersPanel.tsx      Per-role member cards
│           └── modals/               EmployeePicker, RoleChange, Leave,
│                                     AddEmployee, Replace, RemovedList
│
├── SAMPLE ORG (1).xlsx               Sample workbook
├── package.json                      Root: `npm run dev` for both
└── start.bat                         One-click launch
```

---

## Backend API surface

All endpoints sit under `/api`. Auth is JWT-based but the `GET /api/bootstrap` endpoint returns a working token without requiring login (single-user dev mode).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health probe |
| GET | `/api/bootstrap` | Idempotent: creates default tenant/admin + imports workbook on first call, returns JWT |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/tenants/register` | Multi-tenant onboarding |
| GET | `/api/stats` | Totals, roles, max level |
| GET | `/api/filters` | Cascading filter facets |
| GET | `/api/employees` | Directory list with search/filter/pagination |
| POST | `/api/employees` | Add a manually-created person |
| GET | `/api/employees/:key` | Single person (id / EMP ID / name) |
| PUT | `/api/employees/:key` | Update manager_id and/or role_id |
| GET | `/api/employees/:key/subtree` | Recursive tree |
| GET | `/api/employees/:key/ancestry` | Path root → person |
| POST | `/api/employees/:key/leave` | Mark as left + reassign reports |
| POST | `/api/employees/:key/restore` | Un-left a person |
| POST | `/api/employees/:key/replace` | Atomic add+reassign+leave |
| POST | `/api/employees/:key/reassign-reports` | Bulk-move direct reports |
| GET | `/api/roots` | Top-of-org rows |
| GET | `/api/hierarchy/removed` | List leavers |
| POST | `/api/hierarchy/reset` | Drop every override + restore all leavers |
| GET | `/api/roles` | Roles registry |
| POST | `/api/roles` | Create a role |
| PUT | `/api/roles/:id` | Rename / aliases / level / scope override |
| POST | `/api/roles/:id/reset` | Clear overrides on one role |
| POST | `/api/roles/auto-detect` | Re-run discovery + inference |
| POST | `/api/roles/reset-all` | Wipe registry + re-discover from designations |
| POST | `/api/roles/merge` | Atomic merge `{from_id, into_id}` |
| POST | `/api/imports` | Multipart upload of a replacement workbook |
| GET | `/api/imports` | List recent imports |
| POST | `/api/reload` | Re-import `SAMPLE ORG (1).xlsx` from disk |

---

## Data model

The full per-row state lives on the `Position` document:

- Identity: `empId`, `name`, `designation`, `rowNumber`, `sno`
- Geography: `hq`, `zone`, `region`, `state`
- Personal: `doj`, `dob`, `gender`
- Hierarchy: `roleId`, `parentPositionId`
- Pristine values from the most recent import: `originalRoleId`, `originalParentPositionId`, `reportingManagerRaw`
- State flags: `isVacant`, `addedManually`, `leftAt`, `managerOverride`, `roleOverride`, `managerResolution`

Re-importing the workbook **matches by `empId`** so user mutations survive — overrides are layered on top because `parentPositionId` is only re-derived when `managerOverride === false`. "Reset hierarchy" copies `originalParentPositionId` / `originalRoleId` back into the live fields and undoes everything.

`Role` is per-tenant with `aliases`, auto + override level/scope, employee count.

`AuditLog` captures every mutation `(action, entity, before, after, tenantId, userId)`.

---

## Smoke testing

```
# Make sure the server is running, then:
npm --prefix server exec -- tsx scripts/_smoke_api.ts
```

Runs 30 checks against the live HTTP server: bootstrap, stats, filters, list, search, subtree, ancestry, role list, add/edit/move/replace/leave/restore/reassign, hierarchy reset, reload.

```
# Or validate the engine in isolation (in-memory MongoDB):
npm --prefix server run validate
```

---

## How the role/level engine works

For any uploaded workbook the engine:

1. **Discovers roles** from the Designation column (alias-matched, so renames in the UI survive a re-upload).
2. **Infers each role's level** by topologically sorting the role-to-role reporting graph (longest path → leaves L1, root L_max).
3. **Infers each role's scope** (`ALL_INDIA / ZONE / REGION / AREA / HQ`) from how widely its members operate.
4. Lets the user **rename, override, merge, split** roles persistently — every employee card / tree node refreshes immediately because the UI renders `role.name`, not the raw designation.

`override > auto`. "Re-detect" only refreshes the auto side. "Reset all roles" wipes and re-discovers (manual rename / level / scope changes are lost; per-employee role pinnings survive).

### Validation against `SAMPLE ORG (1).xlsx`

| Role | Level | Scope |
|------|-------|-------|
| General Manager | 6 | ALL_INDIA |
| Sales Manager | 5 | ALL_INDIA |
| Zonal Business Manager | 4 | ZONE |
| Deputy Regional Business Manager | 4 | ZONE |
| Regional Business Manager | 3 | ZONE *(override → REGION)* |
| Area Business Manager | 2 | AREA |
| Senior Area Business Manager | 2 | AREA |
| Business Manager | 1 | HQ |
| Trainee Business Manager | 1 | HQ |

---

## Production build

```
npm run build           # builds server (tsc) + client (vite)
npm start               # runs the compiled server, expects pre-built client
```

The client emits a static bundle into `client/dist/`. To serve it from Express, mount it as static middleware before the `/api` 404 handler — left as an exercise so you can pick your CDN / reverse-proxy story.

---

## Multi-tenant + RBAC

The SaaS plumbing is in place under the hood:

- Every Mongoose query filters by `tenantId` from the JWT.
- `requirePermission('role.update')` etc. gate every mutation.
- `withAudit(ctx, action, entity, fn)` writes an audit row for every mutation.
- A second tenant can register via `POST /api/tenants/register` and gets a fully isolated workspace.

Set `DISABLE_BOOTSTRAP=1` in `server/.env` to disable the auto-admin endpoint in production.
