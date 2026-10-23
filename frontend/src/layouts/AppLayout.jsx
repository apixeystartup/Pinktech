import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { getNavSections, isAdminRole } from "../lib/access-control";
import api from "../lib/api";
import { displayAccountEmail } from "../lib/userDisplay";
import WorkflowHint from "../components/common/WorkflowHint";

function AppLayout() {
  const { logout, user, permissionCodes = [], tenantContextId, setTenantContext, currentTenant, isSuperAdmin, accountRole } = useAuth();
  const { pathname } = useLocation();
  const [tenants, setTenants] = useState([]);
  // A regular employee only ever sees themselves + their own reports in Org
  // Explore, so an employee with no reports gets no Org Explore entry at all.
  // Admins always keep it. `null` means "not known yet" — keep the entry until
  // we can tell, rather than hiding a page they may need.
  const [employeeHasTeam, setEmployeeHasTeam] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [auditErrorCount, setAuditErrorCount] = useState(0);
  const orgAdmin = isAdminRole(accountRole, isSuperAdmin);

  // Keep the Activity Log badge honest without making the sidebar depend on
  // the audit page being open. Polls gently and refreshes with tenant context.
  useEffect(() => {
    let active = true;
    const loadErrorCount = () => {
      api
        .get("/audit/logs", { params: { limit: 1, status: "ERROR" } })
        .then((res) => {
          if (active) setAuditErrorCount(Number(res.data?.errorCount || 0));
        })
        .catch(() => {
          if (active) setAuditErrorCount(0);
        });
    };
    loadErrorCount();
    const timer = setInterval(loadErrorCount, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tenantContextId]);


  useEffect(() => {
    if (orgAdmin) return undefined;
    let active = true;
    api
      .get("/org/stats")
      .then((res) => {
        if (active) setEmployeeHasTeam(Number(res.data?.total ?? 0) > 1);
      })
      .catch(() => {
        if (active) setEmployeeHasTeam(true);
      });
    return () => {
      active = false;
    };
  }, [orgAdmin]);

  const hasTeam = orgAdmin || employeeHasTeam !== false;

  const navSections = getNavSections(permissionCodes, isSuperAdmin, accountRole, {
    hideRoutes: hasTeam ? [] : ["/app/org-employees"],
  });
  const canManageTenants = accountRole ? accountRole === "super_admin" : isSuperAdmin;

  useEffect(() => {
    let active = true;
    if (!canManageTenants) {
      return () => {
        active = false;
      };
    }
    api
      .get("/tenants")
      .then((res) => {
        if (active) {
          setTenants(res.data || []);
        }
      })
      .catch(() => {
        if (active) {
          setTenants([]);
        }
      });
    return () => {
      active = false;
    };
  }, [canManageTenants]);

  // Pinktech's own tenant is the platform: the backend never lists it as a
  // tenant, so the header only offers Home (all tenants) plus customer tenants.
  // A selection left over from an earlier visit would point at a tenant the
  // header no longer offers — and picking your own tenant is the same as Home —
  // so fall back to Home.
  useEffect(() => {
    if (!tenantContextId) return;
    const ownTenantId = user?.tenantId ? String(user.tenantId) : "";
    if (ownTenantId && String(tenantContextId) === ownTenantId) {
      setTenantContext("");
    }
  }, [tenantContextId, setTenantContext, user?.tenantId]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);
  const displayName = (user?.name || "").trim();
  const empCode = (user?.empCode || "").trim();
  const accountEmail = displayAccountEmail(user);
  const topbarSummaryTitle = [displayName || null, empCode ? `Employee ID: ${empCode}` : null, accountEmail || null].filter(Boolean).join(" — ");

  return (
    <div className="app-shell">
      <div className="app-main-scroll">
      <header className="topbar">
        <div className="topbar-leading">
          <div className="topbar-brand" aria-hidden>
            <span className="topbar-brand-mark">P</span>
          </div>
          <div className="topbar-titles">
            <div className="topbar-title">
              <span className="topbar-title-word">Pink Tech</span>
              <span className="topbar-title-tag">Workspace</span>
            </div>
            <div className="topbar-meta-block">
              <p className="topbar-subtitle topbar-identity" title={topbarSummaryTitle || undefined}>
                {displayName ? <span className="topbar-employee-name">{displayName}</span> : null}
                {displayName && empCode ? <span aria-hidden> · </span> : null}
                {empCode ? (
                  <span className="topbar-employee-id" title="Employee ID">
                    Employee ID: <strong>{empCode}</strong>
                  </span>
                ) : null}
                {canManageTenants ? (
                  <span className="topbar-tenant-chip" title="X-Tenant-Id override">
                    {tenantContextId
                      ? `Tenant · ${tenants.find((t) => t._id === tenantContextId)?.name || tenantContextId}`
                      : "Home · all tenants"}
                  </span>
                ) : currentTenant ? (
                  <span className="topbar-tenant-chip">
                    {currentTenant.name} · {currentTenant.code}
                  </span>
                ) : null}
              </p>
              <p className="topbar-subtitle topbar-email" title={topbarSummaryTitle || accountEmail || undefined}>
                {accountEmail || "Signed in"}
              </p>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          {canManageTenants ? (
            <select
              className="tenant-context-select"
              aria-label="Act as tenant for org-scoped APIs"
              title="Sets X-Tenant-Id on requests so roles, positions, assignments, and invites apply to the chosen tenant"
              value={tenantContextId}
              onChange={(e) => setTenantContext(e.target.value)}
            >
              <option value="">Home</option>
              {tenants.map((tenant) => (
                <option key={tenant._id} value={tenant._id}>
                  {tenant.name} ({tenant.code})
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={logout} className="btn-secondary">
            Log out
          </button>
          <button
            type="button"
            className="hamburger"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((prev) => !prev)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="shell-body">
        {navOpen ? <div className="sidebar-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" /> : null}
        <aside className={`sidebar${navOpen ? " sidebar--open" : ""}`}>
          <nav aria-label="Main navigation">
            {navSections.map((section) => (
              <div key={section.title} className="sidebar-section">
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end onClick={() => setNavOpen(false)}>
                    {item.label}
                    {item.to === "/app/audit" && auditErrorCount > 0 ? (
                      <span className="nav-count-badge" title={`${auditErrorCount} error${auditErrorCount === 1 ? "" : "s"} recorded`}>
                        {auditErrorCount > 99 ? "99+" : auditErrorCount}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="content">
          <div className="content-inner">
            <WorkflowHint pathname={pathname} accountRole={accountRole} />
            <Outlet />
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}

export default AppLayout;
