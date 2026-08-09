import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { canAccessRoute, getNavSections } from "../lib/access-control";
import api from "../lib/api";
import { displayAccountEmail } from "../lib/userDisplay";

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
}

function AppLayout() {
  const { logout, user, permissionCodes = [], tenantContextId, setTenantContext, currentTenant } = useAuth();
  const [tenants, setTenants] = useState([]);
  const canManageTenants = permissionCodes.includes("tenant.manage");
  const isPlatformUser = user?.tenantCode === "PLATFORM" || currentTenant?.code === "PLATFORM";
  const allNavSections = getNavSections(permissionCodes);
  const navSections = isPlatformUser
    ? allNavSections
    : allNavSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.to !== "/tenants"),
      })).filter((section) => section.items.length > 0);

  useEffect(() => {
    let active = true;
    if (!canManageTenants) {
      return () => { active = false; };
    }
    api
      .get("/tenants")
      .then((res) => {
        if (active) setTenants(res.data || []);
      })
      .catch(() => {
        if (active) setTenants([]);
      });
    return () => { active = false; };
  }, [canManageTenants]);

  const catalogLink = canAccessRoute("/permissions", permissionCodes);
  const displayName = (user?.name || "").trim();
  const empCode = (user?.empCode || "").trim();
  const accountEmail = displayAccountEmail(user);
  const topbarSummaryTitle = [displayName || null, empCode ? `Employee ID: ${empCode}` : null, accountEmail || null].filter(Boolean).join(" — ");
  const userInitials = (displayName || accountEmail || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <div className="app-shell">
      <div className="app-main-scroll">
      <header className="topbar">
        <div className="topbar-leading">
          <div className="topbar-brand" aria-hidden>
            <span className="topbar-brand-mark">A</span>
          </div>
          <div className="topbar-titles">
            <h1 className="topbar-title">
              <span className="topbar-title-word">Approve.io</span>
              <span className="topbar-title-tag">Approvals</span>
            </h1>
            <div className="topbar-meta-block">
              {displayName || empCode ? (
                <p className="topbar-subtitle topbar-employee-summary" title={topbarSummaryTitle || undefined}>
                  {displayName ? <span className="topbar-employee-name">{displayName}</span> : null}
                  {displayName && empCode ? <span aria-hidden> · </span> : null}
                  {empCode ? (
                    <span className="topbar-employee-id" title="Employee ID">
                      Employee ID: <strong>{empCode}</strong>
                    </span>
                  ) : null}
                </p>
              ) : null}
              <p className="topbar-subtitle topbar-email" title={topbarSummaryTitle || accountEmail || undefined}>
                {accountEmail || "Signed in"}
              </p>
              <div className="topbar-meta-row">
                {catalogLink ? (
                  <NavLink to="/permissions" className="topbar-pill" title="Open access catalog">
                    {permissionCodes.length} grants
                  </NavLink>
                ) : (
                  <span className="topbar-pill topbar-pill--muted">{permissionCodes.length} grants</span>
                )}
                {isPlatformUser && canManageTenants ? (
                  <span className="topbar-tenant-hint" title="X-Tenant-Id override">
                    Tenant · {tenantContextId || user?.tenantId || "home"}
                  </span>
                ) : currentTenant ? (
                  <span className="topbar-tenant-hint">
                    {currentTenant.name} · {currentTenant.code}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="topbar-avatar" title={displayName || accountEmail}>
            {userInitials}
          </div>
          {isPlatformUser && canManageTenants ? (
            <select
              className="tenant-context-select"
              aria-label="Act as tenant for org-scoped APIs"
              title="Sets X-Tenant-Id on requests so roles, positions, assignments, and invites apply to the chosen tenant"
              value={tenantContextId}
              onChange={(e) => setTenantContext(e.target.value)}
            >
              <option value="">Home tenant only (no override)</option>
              {tenants.map((tenant) => (
                <option key={tenant._id} value={tenant._id}>
                  {tenant.name} ({tenant.code})
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="btn-icon theme-toggle"
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle light or dark theme"
          >
            <span className="btn-icon__sun" aria-hidden>
              ☀
            </span>
            <span className="btn-icon__moon" aria-hidden>
              ☾
            </span>
          </button>
          <button type="button" onClick={logout} className="btn-secondary">
            Log out
          </button>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          {navSections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <h3>{section.title}</h3>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                  {item.icon ? (
                    <svg className="sidebar-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <g dangerouslySetInnerHTML={{ __html: item.icon }} />
                    </svg>
                  ) : null}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <main className="content">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}

export default AppLayout;
