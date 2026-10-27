import { useEffect, useRef, useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { getNavSections, isAdminRole } from "../lib/access-control";
import api from "../lib/api";
import { displayAccountEmail } from "../lib/userDisplay";
import WorkflowHint from "../components/common/WorkflowHint";
import { useToast } from "../components/common/ToastProvider";
import { getErrorMessage } from "../lib/error";

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function isActivePath(pathname, to) {
  if (to === "/app") return pathname === "/app";
  if (to === "/app/notifications" && pathname.startsWith("/app/audit")) return true;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function AppLayout() {
  const { logout, user, permissionCodes = [], tenantContextId, setTenantContext, currentTenant, isSuperAdmin, accountRole, refreshCurrentTenant } = useAuth();
  const { showToast } = useToast();
  const { pathname, search } = useLocation();
  const [tenants, setTenants] = useState([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [auditErrorCount, setAuditErrorCount] = useState(0);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [savingLogo, setSavingLogo] = useState(false);
  const accountRef = useRef(null);
  const workspaceMenuRef = useRef(null);
  const logoInputRef = useRef(null);

  // Counts stay unread until the user opens the shared inbox/activity page.
  useEffect(() => {
    let active = true;
    const loadCounts = async () => {
      const [auditResult, notificationResult] = await Promise.allSettled([
        api.get("/audit/logs", { params: { limit: 1, status: "ERROR" } }),
        api.get("/notifications/unread-count"),
      ]);
      if (!active) return;
      if (auditResult.status === "fulfilled") {
        setAuditErrorCount(Number(auditResult.value.data?.unreadErrorCount || 0));
      }
      if (notificationResult.status === "fulfilled") {
        setNotificationUnreadCount(Number(notificationResult.value.data?.unreadCount || 0));
      }
    };
    const inboxIsOpen =
      pathname.startsWith("/app/notifications") || pathname.startsWith("/app/audit");
    if (inboxIsOpen) {
      Promise.allSettled([
        api.post("/notifications/read"),
        api.post("/audit/logs/read"),
      ]).then((results) => {
        if (!active) return;
        if (results[0].status === "fulfilled") setNotificationUnreadCount(0);
        if (results[1].status === "fulfilled") setAuditErrorCount(0);
        const failed = results.find((result) => result.status === "rejected");
        if (failed) showToast(getErrorMessage(failed.reason), "error");
        loadCounts();
      });
    } else {
      loadCounts();
    }
    const timer = setInterval(loadCounts, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tenantContextId, pathname, showToast]);


  const platformAdmin = Boolean(isSuperAdmin || accountRole === "super_admin");
  const navSections = getNavSections(permissionCodes, platformAdmin, accountRole);
  const navItems = navSections.flatMap((section) => section.items);
  const canManageTenants = platformAdmin;

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
    if (!workspaceMenuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    };
    const onDown = (event) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target)) {
        setWorkspaceMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    setAccountOpen(false);
    setWorkspaceMenuOpen(false);
  }, [pathname, search]);

  const displayName = (user?.name || "").trim();
  const empCode = (user?.empCode || "").trim();
  const accountEmail = displayAccountEmail(user);
  const roleLabel = platformAdmin ? "Super Admin" : accountRole === "tenant_admin" ? "Admin" : "Employee";
  // Wireframe topbar: tenant identity plus the signed-in account role.
  const brandRole = platformAdmin
    ? "Platform admin"
    : accountRole === "tenant_admin"
      ? "Tenant admin"
      : roleLabel;
  const tenantName = currentTenant?.name || "Pinktech";
  const tenantLogo = currentTenant?.logo || "";
  const designation = user?.designationOverride || user?.designation || brandRole;
  const canEditBrand = isAdminRole(accountRole, isSuperAdmin);
  const topbarSummaryTitle = [displayName || null, empCode ? `Employee ID: ${empCode}` : null, accountEmail || null].filter(Boolean).join(" — ");

  const updateTenantLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showToast("Choose a PNG, JPEG, or WebP logo.", "error");
      return;
    }
    if (file.size > 850 * 1024) {
      showToast("Logo must be 850 KB or smaller.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showToast("Could not read the selected logo.", "error");
    reader.onload = async () => {
      setSavingLogo(true);
      try {
        await api.patch("/tenants/current", { logo: reader.result });
        await refreshCurrentTenant();
        showToast("Workspace logo updated.", "success");
      } catch (error) {
        showToast(getErrorMessage(error), "error");
      } finally {
        setSavingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // On narrow screens the header title identifies the current page; all roles
  // use the same role-specific navigation entry point as on desktop.
  const mobileTitle =
    pathname.startsWith("/app/forms")
      ? "Forms templates"
      : pathname.startsWith("/app/notifications") || pathname.startsWith("/app/audit")
        ? "Inbox & activity"
      : pathname.startsWith("/app/tenants")
        ? "Tenants"
      : navItems.find((item) => isActivePath(pathname, item.to))?.label || "Dashboard";

  return (
    <div className="app-shell">
      <div className="app-main-scroll">
      <header className="topbar">
        <div className="topbar-leading">
          <Link className="topbar-brand" to="/app" aria-label="Pinktech dashboard">
            {tenantLogo ? (
              <img className="topbar-brand-mark tenant-brand-image" src={tenantLogo} alt="" />
            ) : (
              <span className="topbar-brand-mark" aria-hidden="true">{initialsOf(tenantName)}</span>
            )}
            <span className="topbar-brand-word">
              <strong>{tenantName}</strong>
              <small>{brandRole}</small>
            </span>
          </Link>
          <span className="wf-mobile-title" aria-hidden="true">{mobileTitle}</span>
        </div>

        <div className="topbar-actions">
          <Link
            className={`inbox-bell${notificationUnreadCount && auditErrorCount ? " is-split" : notificationUnreadCount ? " is-notification" : auditErrorCount ? " is-error" : ""}`}
            to="/app/notifications"
            aria-label={`Inbox and activity: ${notificationUnreadCount} unread notifications and ${auditErrorCount} unread audit errors`}
            title={`${notificationUnreadCount} unread notification${notificationUnreadCount === 1 ? "" : "s"} · ${auditErrorCount} unread audit error${auditErrorCount === 1 ? "" : "s"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke={notificationUnreadCount && auditErrorCount ? "url(#inbox-bell-split)" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <defs>
                <linearGradient id="inbox-bell-split">
                  <stop offset="50%" stopColor="#b89a00" />
                  <stop offset="50%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            {(notificationUnreadCount + auditErrorCount) > 0 ? (
              <>
                <span className="inbox-bell__count" aria-hidden="true">
                  {(notificationUnreadCount + auditErrorCount) > 99 ? "99+" : notificationUnreadCount + auditErrorCount}
                </span>
                <span
                  className={`inbox-bell__indicator${notificationUnreadCount && auditErrorCount ? " is-split" : notificationUnreadCount ? " is-notification" : " is-error"}`}
                  aria-hidden="true"
                />
              </>
            ) : null}
          </Link>
          {platformAdmin ? (
            <div className="workspace-nav" ref={workspaceMenuRef}>
              <button
                type="button"
                className="workspace-nav-trigger"
                aria-label={workspaceMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={workspaceMenuOpen}
                aria-haspopup="menu"
                onClick={() => setWorkspaceMenuOpen((prev) => !prev)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {workspaceMenuOpen ? (
                <nav className="workspace-nav-menu" aria-label="Main navigation" role="menu">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      role="menuitem"
                      className={({ isActive }) => `workspace-nav-link${isActivePath(pathname, item.to) || isActive ? " is-active" : ""}`}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              ) : null}
            </div>
          ) : null}
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
                  <div className="account-menu-profile">
                    <span className="account-menu-name">{displayName || "Signed in"}</span>
                    <span className="account-menu-mail">{accountEmail}</span>
                    {empCode ? <span className="account-menu-meta">Employee ID {empCode}</span> : null}
                    <span className="account-menu-meta">{designation}</span>
                  </div>
                  <div className="account-menu-brand">
                    {tenantLogo ? (
                      <img src={tenantLogo} className="account-menu-brand-logo" alt="" />
                    ) : (
                      <span className="account-menu-brand-logo account-menu-brand-fallback">{initialsOf(tenantName)}</span>
                    )}
                    <span className="account-menu-brand-name">{tenantName}</span>
                    {canEditBrand ? (
                      <>
                        <input
                          ref={logoInputRef}
                          className="account-menu-logo-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={updateTenantLogo}
                        />
                        <button
                          type="button"
                          className="account-menu-brand-edit"
                          aria-label="Edit workspace logo"
                          title={savingLogo ? "Saving logo…" : "Edit workspace logo"}
                          disabled={savingLogo}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="m14 5 5 5M4 20l4.4-.9L19.2 8.3a2.1 2.1 0 0 0-3-3L5.4 16.1 4 20Z" />
                          </svg>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {!platformAdmin ? (
                  <nav className="account-menu-nav" aria-label="Main navigation">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end
                        role="menuitem"
                        className={({ isActive }) => `account-menu-nav-link${isActivePath(pathname, item.to) || isActive ? " is-active" : ""}`}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>
                ) : null}

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
