import "../../../styles/wf-audit.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

const ACTION_LABELS = {
  AUTH_LOGIN: "Login",
  AUTH_OTP_VERIFY: "OTP verification",
  AUTH_PASSWORD_SET: "Password set",
  AUTH_PASSWORD_RESET: "Password reset",
  AUTH_PASSWORD_RESET_REQUESTED: "Password reset requested",
  TENANT_ADMIN_ACCOUNT_UNLOCKED: "Admin unlocked",
  USER_INVITED: "Employee invited",
  USER_UPDATED: "Employee updated",
  USER_DELETED: "Employee deleted",
  USER_CREDENTIALS_SENT: "Credentials sent",
  USER_REPORTING_ASSIGNED_BULK: "Reporting assigned",
  FORM_CREATED: "Form creation",
  FORM_UPDATED: "Form updated",
  FORM_DELETED: "Form deleted",
  FORM_SUBMITTED: "Form submitted",
  FORM_ASSIGNED: "Form assigned",
  WORKFLOW_CREATED: "Workflow created",
  WORKFLOW_UPDATED: "Workflow updated",
  DOCTOR_CREATED: "Doctor created",
  DOCTOR_UPDATED: "Doctor updated",
  DOCTOR_DELETED: "Doctor deleted",
  DOCTOR_COMPLIANCE_ASSIGNED: "Compliance form assigned",
  SEAT_ASSIGNED: "Seat assigned",
  ASSIGNMENT_UPDATED: "Assignment updated",
  POSITION_CREATED: "Position created",
  POSITION_UPDATED: "Position updated",
  POSITION_DELETED_BULK: "Positions deleted",
  TENANT_CREATED: "Tenant created",
  TENANT_UPDATED: "Tenant updated",
  TENANT_PROFILE_UPDATED: "Org data updated",
  TENANT_ADMIN_ASSIGNED: "Admin assigned",
  TENANT_ADMIN_UNASSIGNED: "Admin removed",
  TENANT_DELETED: "Tenant deleted",
  TENANT_CREDENTIALS_SENT: "Tenant credentials sent",
  ROLE_CREATED: "Role created",
  ROLE_UPDATED: "Role updated",
  ROLE_DELETED: "Role deleted",
  ROLE_DELETED_BULK: "Roles deleted",
  ORG_ADD_EMPLOYEE: "Org employee added",
  ORG_SET_MANAGER: "Manager updated",
  ORG_SET_ROLE: "Org role updated",
  ORG_MARK_LEFT: "Employee marked left",
  ORG_RESTORE: "Employee restored",
  ORG_HIERARCHY_RESET: "Hierarchy reset",
  NOTIFICATION_SENT: "Message sent",
  KYC_ACTION: "KYC action",
  KYC_OTP_INITIATED: "KYC OTP initiated",
  KYC_VERIFIED: "KYC verified",
  EXTERNAL_USER_CREATED: "External user created",
  EXTERNAL_USER_UPDATED: "External user updated",
  EXTERNAL_USER_DELETED: "External user deleted",
};

function actionLabel(action) {
  if (!action) return "Activity";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const rawAction = String(action).trim();
  const request = rawAction.match(/^([A-Z]+)\s+(\/\S*)$/i);
  if (request) {
    const [, method, path] = request;
    const segments = path.split("/").filter(Boolean);
    if (segments[segments.length - 1]?.toLowerCase() === "ancestry") return "View ancestry";
    const resource = segments.reverse().find((segment) => !/^(v\d+|\d+|[a-f\d]{16,}|<?:?[a-z]+id>?)$/i.test(segment));
    const verb = {
      GET: "View",
      POST: "Create",
      PUT: "Update",
      PATCH: "Update",
      DELETE: "Delete",
    }[method.toUpperCase()] || "Process";
    const subject = String(resource || "request")
      .replace(/[-_]+/g, " ")
      .replace(/s$/, "");
    return `${verb} ${subject}`.trim().split(/\s+/).slice(0, 3).join(" ");
  }
  return rawAction
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .slice(0, 3)
    .join(" ");
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") return "—";
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${(durationMs / 1000).toFixed(1).replace(/\.0$/, "")} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function actionTone(action = "") {
  const value = String(action).toUpperCase();
  if (value.startsWith("AUTH")) return "auth";
  if (value.startsWith("FORM") || value.startsWith("WORKFLOW")) return "form";
  if (value.startsWith("USER") || value.startsWith("EMPLOYEE")) return "user";
  if (value.startsWith("DOCTOR") || value.startsWith("KYC") || value.startsWith("EXTERNAL")) return "compliance";
  if (value.startsWith("TENANT") || value.startsWith("ORG") || value.startsWith("ROLE")) return "org";
  return "neutral";
}

function actionMark(action = "") {
  const words = String(action).replace(/[^a-zA-Z]/g, " ").trim().split(/\s+/);
  if (!words[0]) return "•";
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] || ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function userDisplayLabel(user) {
  return user?.displayLabel || user?.name || "System";
}

function formatDate(value) {
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function Icon({ name }) {
  const paths = {
    search: "M21 21l-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    check: "M20 6 9 17l-5-5",
    alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
    arrow: "m9 18 6-6-6-6",
    clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.clock} />
    </svg>
  );
}

function AuditPage({ embedded = false }) {
  const { showToast } = useToast();
  const { tenantContextId, accountRole, isSuperAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ pages: 1, total: 0, errorCount: 0, scope: "" });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState(null);

  const role = isSuperAdmin || accountRole === "super_admin"
    ? "super_admin"
    : accountRole === "tenant_admin"
      ? "tenant_admin"
      : "employee";
  const roleLabel = role === "super_admin" ? "Super admin" : role === "tenant_admin" ? "Admin" : "Employee";

  const load = useCallback(
    async (nextPage = page, { silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const params = { page: nextPage, limit: 20 };
        if (statusFilter !== "ALL") params.status = statusFilter;
        if (appliedQuery.trim()) params.q = appliedQuery.trim();
        const res = await api.get("/audit/logs", { params });
        setItems(res.data.items || []);
        setPage(res.data.page || nextPage);
        setMeta((prev) => ({
          ...prev,
          pages: res.data.pages || 1,
          total: res.data.total || 0,
          errorCount: res.data.errorCount ?? prev.errorCount,
          scope: res.data.scope || prev.scope,
        }));
      } catch (error) {
        if (!silent) showToast(getErrorMessage(error), "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, statusFilter, appliedQuery, showToast],
  );

  useEffect(() => {
    setPage(1);
    load(1);
    // tenant context changes the visible scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, appliedQuery, tenantContextId]);

  useEffect(() => {
    const timer = setInterval(() => load(page, { silent: true }), 15000);
    return () => clearInterval(timer);
  }, [load, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQuery(query);
      setPage(1);
    }, 320);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selectedError) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setSelectedError(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedError]);

  const summary = useMemo(() => {
    const errors = items.filter((item) => item.status === "ERROR").length;
    return {
      visibleErrors: errors,
      successRate: items.length ? Math.round(((items.length - errors) / items.length) * 100) : 100,
    };
  }, [items]);

  const tabs = [
    { key: "ALL", label: "All activity", count: meta.total },
    { key: "SUCCESS", label: "Successful" },
    { key: "ERROR", label: "Errors", count: meta.errorCount, danger: true },
  ];

  const description = (
    <>
      <span className="audit-desc-prefix">{`${roleLabel} view · ${meta.scope || "Your scoped audit trail."} `}</span>
      Every action is recorded with its outcome.
    </>
  );
  const rolePill = (
    <span className={`audit-role-pill audit-role-pill--${role}`}>
      {roleLabel}
    </span>
  );
  const content = (
    <div className="audit-page">
      {embedded ? (
        <div className="audit-embedded-header">
          <div>
            <h2>Activity log</h2>
            <p>{description}</p>
          </div>
          {rolePill}
        </div>
      ) : null}
      <div className="audit-stat-row">
        <div className="audit-stat">
          <span className="audit-stat__icon audit-stat__icon--total"><Icon name="clock" /></span>
          <div>
            <p>Events in scope</p>
            <strong>{meta.total.toLocaleString()}</strong>
          </div>
        </div>
        <div className="audit-stat">
          <span className="audit-stat__icon audit-stat__icon--error"><Icon name="alert" /></span>
          <div>
            <p>Errors recorded</p>
            <strong>{meta.errorCount.toLocaleString()}</strong>
          </div>
        </div>
        <div className="audit-stat">
          <span className="audit-stat__icon audit-stat__icon--success"><Icon name="check" /></span>
          <div>
            <p>
              <span className="audit-stat__label-desk">Success rate on this page</span>
              <span className="audit-stat__label-mob">Success rate</span>
            </p>
            <strong>{summary.successRate}%</strong>
          </div>
        </div>
      </div>

      <div className="audit-toolbar">
        <div className="audit-tabs" role="tablist" aria-label="Filter by status">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.key}
              className={`audit-tab${statusFilter === tab.key ? " is-active" : ""}${tab.danger ? " audit-tab--danger" : ""}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span className="audit-tab__count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="audit-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, person, employee ID or tenant…"
            aria-label="Search activity"
          />
          {query ? (
            <button type="button" className="audit-search__clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          ) : null}
        </label>
      </div>

      <div className="audit-table-card">
        {loading ? (
          <div className="audit-skeleton" aria-label="Loading activity">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="audit-skeleton__row" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="audit-empty">
            <span className="audit-empty__icon"><Icon name="clock" /></span>
            <h3>No activity matches this view</h3>
            <p>{statusFilter === "ERROR" ? "No errors have been recorded in your scope." : "Try clearing the search or switching tabs."}</p>
          </div>
        ) : (
          <div className="audit-table-scroll audit-only-desk">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>At</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Time taken</th>
                  <th className="audit-table__status-col">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const when = formatDate(item.createdAt);
                  const user = item.user;
                  return (
                    <tr key={item._id} className={item.status === "ERROR" ? "is-error" : ""}>
                      <td>
                        <div className="audit-when">
                          <strong>{when.date}</strong>
                          <span>{when.time}</span>
                        </div>
                      </td>
                      <td>
                        <div className="audit-action">
                          <span className={`audit-action__mark audit-action__mark--${actionTone(item.action)}`}>
                            {actionMark(item.action)}
                          </span>
                          <div>
                            <strong>{actionLabel(item.action)}</strong>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="audit-user">
                          <span className="audit-avatar">{initials(userDisplayLabel(user))}</span>
                          <div className="audit-user__text">
                            <strong>{userDisplayLabel(user)}</strong>
                            <span>
                              {user?.empCode ? <span className="audit-emp">EMP {user.empCode}</span> : null}
                              {user?.empCode ? " · " : null}
                              {item.tenantOrgLabel || "Platform"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="audit-duration">{formatDuration(item.durationMs)}</td>
                      <td className="audit-table__status-col">
                        <button
                          type="button"
                          className={`audit-status audit-status--${String(item.status || "success").toLowerCase()}`}
                          onClick={() => setSelectedError(item)}
                          title={item.status === "ERROR" ? "View error details" : "View activity details"}
                        >
                          {item.status === "ERROR" ? <Icon name="alert" /> : <Icon name="check" />}
                          {String(item.status || "SUCCESS").toUpperCase()}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 ? (
          <div className="audit-cards audit-only-mob">
            <div className="audit-cards__label">
              <span>At</span>
              <span>Activity</span>
            </div>
            {items.map((item) => {
              const when = formatDate(item.createdAt);
              const user = item.user;
              return (
                <article key={`m-${item._id}`} className="audit-card">
                  <div className="audit-card__head">
                    <div className="audit-card__when">
                      <strong>{when.date}</strong>
                      <span>{when.time}</span>
                    </div>
                    <button
                      type="button"
                      className={`audit-status audit-status--${String(item.status || "success").toLowerCase()}`}
                      onClick={() => setSelectedError(item)}
                      title={item.status === "ERROR" ? "View error details" : "View activity details"}
                    >
                      {String(item.status || "SUCCESS").toUpperCase()}
                    </button>
                  </div>
                  <div className="audit-card__body">
                    <div className="audit-card__row">
                      <strong>{actionLabel(item.action)}</strong>
                    </div>
                    <div className="audit-card__row">
                      <strong>{userDisplayLabel(user)}</strong>
                      <span>{user?.empCode ? `EMP ${user.empCode} · ` : ""}{item.tenantOrgLabel || "Platform"}</span>
                    </div>
                    <div className="audit-card__row">
                      <strong>Time taken</strong>
                      <span>{formatDuration(item.durationMs)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        <div className="audit-pager">
          <span>
            {meta.total.toLocaleString()} {meta.total === 1 ? "event" : "events"} · Page {page} of {meta.pages || 1}
          </span>
          <div className="audit-pager__buttons">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= (meta.pages || 1) || loading}
              onClick={() => load(page + 1)}
            >
              Next <Icon name="arrow" />
            </button>
          </div>
        </div>
      </div>

      {selectedError ? (
        <div className="audit-modal-backdrop" role="presentation" onClick={() => setSelectedError(null)}>
          <div
            className="audit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`audit-modal__head ${selectedError.status === "ERROR" ? "is-error" : ""}`}>
              <span className="audit-modal__icon">
                <Icon name={selectedError.status === "ERROR" ? "alert" : "check"} />
              </span>
              <div>
                <p className="audit-modal__eyebrow">{selectedError.status === "ERROR" ? "Error details" : "Activity details"}</p>
                <h2 id="audit-detail-title">{actionLabel(selectedError.action)}</h2>
              </div>
              <button type="button" className="audit-modal__close" onClick={() => setSelectedError(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="audit-modal__body">
              <dl className="audit-detail-grid">
                <div>
                  <dt>When</dt>
                  <dd>{new Date(selectedError.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>User</dt>
                  <dd>
                    {userDisplayLabel(selectedError.user)}
                    {selectedError.user?.empCode ? ` · EMP ${selectedError.user.empCode}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Organization</dt>
                  <dd>{selectedError.tenantOrgLabel || "Platform"}</dd>
                </div>
                <div>
                  <dt>Action code</dt>
                  <dd className="audit-mono">{selectedError.action}</dd>
                </div>
                <div>
                  <dt>Request</dt>
                  <dd className="audit-mono">
                    {selectedError.metadata?.method || "—"} {selectedError.metadata?.path || ""}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`audit-status audit-status--${String(selectedError.status || "success").toLowerCase()}`}>
                      {selectedError.status || "SUCCESS"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Time taken</dt>
                  <dd>{formatDuration(selectedError.durationMs)}</dd>
                </div>
              </dl>

              {selectedError.status === "ERROR" ? (
                <div className="audit-error-box">
                  <h3>What the user saw</h3>
                  <p>{selectedError.errorMessage || "The request failed without a detailed message."}</p>
                  {selectedError.metadata?.statusCode ? (
                    <span className="audit-error-code">HTTP {selectedError.metadata.statusCode}</span>
                  ) : null}
                </div>
              ) : (
                <div className="audit-ok-box">
                  <Icon name="check" />
                  <p>This action completed successfully.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return embedded
    ? content
    : (
      <ModulePage title="Activity Log" description={description} actions={rolePill}>
        {content}
      </ModulePage>
    );
}

export default AuditPage;
