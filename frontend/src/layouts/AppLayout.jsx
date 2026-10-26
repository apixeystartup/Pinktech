import { useEffect, useRef, useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { getNavSections, isAdminRole } from "../lib/access-control";
import api from "../lib/api";
import { displayAccountEmail } from "../lib/userDisplay";
import WorkflowHint from "../components/common/WorkflowHint";

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/* Mobile bottom tab bar — the wireframe keeps the five destinations people
   actually reach for on a phone, and hides the rest behind "More". */
const PRIMARY_TABS = [
  { to: "/app", label: "Dashboard", icon: "dashboard" },
  { to: "/app/tenants", label: "Tenants", icon: "tenants" },
  { to: "/app/forms", label: "Forms", icon: "forms" },
  { to: "/app/audit", label: "Activity", icon: "activity" },
];

const TAB_ICONS = {
  dashboard: (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </>
  ),
  tenants: (
    <>
      <path d="M3 21h18M5 21V5l7-2 7 2v16M9.5 8h.01M14.5 8h.01M9.5 12h.01M14.5 12h.01M10 21v-4h4v4" />
    </>
  ),
  forms: (
    <>
      <path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 3h6v3H9zM8 11h8M8 15h5" />
    </>
  ),
  activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
};

function isActivePath(pathname, to) {
  return to === "/app" ? pathname === "/app" : pathname === to || pathname.startsWith(`${to}/`);
}

function AppLayout() {
  const { logout, user, permissionCodes = [], tenantContextId, setTenantContext, currentTenant, isSuperAdmin, accountRole } = useAuth();
  const { pathname, search } = useLocation();
  const [tenants, setTenants] = useState([]);
  // A regular employee only ever sees themselves + their own reports in Org
  // Explore, so an employee with no reports gets no Org Explore entry at all.
  // Admins always keep it. `null` means "not known yet" — keep the entry until
  // we can tell, rather than hiding a page they may need.
  const [employeeHasTeam, setEmployeeHasTeam] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [auditErrorCount, setAuditErrorCount] = useState(0);
  const accountRef = useRef(null);
  const orgAdmin = isAdminRole(accountRole, isSuperAdmin);

  // Keep the Activity Log badge honest without making the nav depend on
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
  const navItems = navSections.flatMap((section) => section.items);
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
        if (active) setTenants([]);
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
    if (!accountOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountOpen]);

  // The account pill is a menu: a click anywhere outside it (and a route
  // change) closes it, so it never sits open over the page behind.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  useEffect(() => {
    setAccountOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const displayName = (user?.name || "").trim();
  const empCode = (user?.empCode || "").trim();
  const accountEmail = displayAccountEmail(user);
  const roleLabel = isSuperAdmin ? "Super Admin" : accountRole === "tenant_admin" ? "Admin" : "Employee";
  // Wireframe topbar: "Pinktech  Platform admin" — brand wordmark plus the
  // signed-in role, on one line.
  const brandRole = isSuperAdmin
    ? "Platform admin"
    : accountRole === "tenant_admin"
      ? "Tenant admin"
      : roleLabel;
  const topbarSummaryTitle = [displayName || null, empCode ? `Employee ID: ${empCode}` : null, accountEmail || null].filter(Boolean).join(" — ");

  // Mobile: the header shows the current screen's name, and the bottom bar
  // offers the four primary destinations plus a "More" sheet for the rest.
  const mobileTitle =
    pathname.startsWith("/app/forms")
      ? "Forms templates"
      : navItems.find((item) => isActivePath(pathname, item.to))?.label || "Dashboard";
  const primaryTabs = PRIMARY_TABS.map((tab) => ({
    ...tab,
    item: navItems.find((item) => item.to === tab.to),
  })).filter((tab) => tab.item);
  const moreItems = navItems.filter(
    (item) => !PRIMARY_TABS.some((tab) => tab.to === item.to),
  );

  return (
    <div className="app-shell">
      <div className="app-main-scroll">
      <header className="topbar">
        <div className="topbar-leading">
          <Link className="topbar-brand" to="/app" aria-label="Pinktech dashboard">
            <span className="topbar-brand-mark" aria-hidden="true">P</span>
            <span className="topbar-brand-word">
              <strong>Pinktech</strong>
              <small>{brandRole}</small>
            </span>
          </Link>
          <span className="wf-mobile-title" aria-hidden="true">{mobileTitle}</span>
        </div>

        <nav className="pillnav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `pillnav-item${isActive ? " is-active" : ""}`}
            >
              <span className="pillnav-label">{item.label}</span>
              {item.to === "/app/audit" && auditErrorCount > 0 ? (
                <span className="pillnav-badge" title={`${auditErrorCount} error${auditErrorCount === 1 ? "" : "s"} recorded`}>
                  {auditErrorCount > 99 ? "99+" : auditErrorCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="account" ref={accountRef}>
            <button
              type="button"
              className="account-trigger"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              title={topbarSummaryTitle || undefined}
              onClick={() => setAccountOpen((prev) => !prev)}
            >
              <span className="account-avatar" aria-hidden="true">{initialsOf(displayName || roleLabel)}</span>
              <span className="account-name">{displayName ? displayName.split(/\s+/)[0] : roleLabel}</span>
              <span className="account-caret" aria-hidden="true" />
            </button>

            {accountOpen ? (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <span className="account-menu-name">{displayName || "Signed in"}</span>
                  <span className="account-menu-mail">{accountEmail}</span>
                  {empCode ? <span className="account-menu-meta">Employee ID {empCode}</span> : null}
                  <span className="account-menu-meta">{roleLabel}</span>
                </div>

                {canManageTenants ? (
                  <label className="account-menu-field">
                    <span>Tenant context</span>
                    <select
                      value={tenantContextId}
                      onChange={(e) => setTenantContext(e.target.value)}
                      title="Sets X-Tenant-Id on requests so roles, positions, assignments, and invites apply to the chosen tenant"
                    >
                      <option value="">Home · all tenants</option>
                      {tenants.map((tenant) => (
                        <option key={tenant._id} value={tenant._id}>
                          {tenant.name} ({tenant.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : currentTenant ? (
                  <div className="account-menu-field">
                    <span>Tenant</span>
                    <strong>{currentTenant.name} · {currentTenant.code}</strong>
                  </div>
                ) : null}

                <button type="button" className="account-menu-out" onClick={logout} role="menuitem">
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <nav className={`wf-tabbar${moreOpen ? " is-open" : ""}`} aria-label="Primary">
        {moreOpen ? (
          <div className="wf-sheet">
            {moreItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActivePath(pathname, item.to) ? "is-active" : ""}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
        {primaryTabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.item.to}
            className={`wf-tab${isActivePath(pathname, tab.item.to) ? " is-active" : ""}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{TAB_ICONS[tab.icon]}</svg>
            <span>{tab.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`wf-tab wf-tab-more${moreOpen ? " is-active" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">{TAB_ICONS.more}</svg>
          <span>More</span>
        </button>
      </nav>
      <div className="shell-body">
        <main className="content">
          <div className="content-inner">
            <WorkflowHint pathname={pathname} search={search} accountRole={accountRole} />
            <Outlet key={tenantContextId || "home"} />
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}

export default AppLayout;
