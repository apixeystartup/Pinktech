import "../styles/wf-dashboard.css";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import api from "../lib/api";
import { useToast } from "../components/common/ToastProvider";
import buildDashboardModel, {
  buildAttentionItems,
  buildStatCards,
  buildWeekSeries,
  capitalizeWord,
  tenantLastActivity,
} from "../components/dashboard/dashboardModel";
import useRecentActivity, { usePlatformActivity } from "../components/dashboard/useRecentActivity";
import {
  AttentionCard,
  HappeningCard,
  HeaderButtons,
  IconArrow,
  StatCards,
} from "../components/dashboard/DashboardBlocks";
import { downloadReport } from "../components/dashboard/reportDownload";

function ExpandToggle({ expanded, label }) {
  return (
    <span className="wf-row-toggle">
      <svg
        className={`wf-caret${expanded ? " is-open" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9.5 5.5 16 12l-6.5 6.5" />
      </svg>
      <span className="wf-row-name">{label}</span>
    </span>
  );
}

function SubSection({ open, onToggle, title, count, children }) {
  return (
    <div className="dash-sub-section">
      <button type="button" className="dash-sub-toggle" onClick={onToggle} aria-expanded={open}>
        <span className={`dash-expand-caret ${open ? "dash-expand-caret--open" : ""}`}>&#9654;</span>
        <span className="dash-expand-text">{title}</span>
        {count != null ? <span className="dash-expand-count">({count})</span> : null}
      </button>
      {open ? children : null}
    </div>
  );
}

function statusMeta(status) {
  const key = String(status || "").toUpperCase();
  if (key === "OTP_PENDING") return { text: "Invite", mod: "invite" };
  if (key === "ACTIVE") return { text: "Active", mod: "active" };
  if (key === "INVITED") return { text: "Invited", mod: "invited" };
  if (key === "SUSPENDED") return { text: "Suspended", mod: "suspended" };
  return { text: status || "—", mod: key ? key.toLowerCase() : "unknown" };
}

function SuperAdminDashboard({ data, feed, onReload, refreshTick = 0 }) {
  const { tenants } = data;
  const { showToast } = useToast();
  const [expandedTenant, setExpandedTenant] = useState(null);
  const [tenantEmployees, setTenantEmployees] = useState({});
  const [tenantDoctors, setTenantDoctors] = useState({});
  const [collapsedSub, setCollapsedSub] = useState({});
  const [rolesByTenant, setRolesByTenant] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ empCode: "", roleIds: [] });
  const [savingEmp, setSavingEmp] = useState(false);

  const isSubOpen = (tenantId, kind) => !collapsedSub[`${tenantId}:${kind}`];
  const toggleSub = (tenantId, kind) =>
    setCollapsedSub((prev) => ({
      ...prev,
      [`${tenantId}:${kind}`]: !prev[`${tenantId}:${kind}`],
    }));

  const loadRows = (tenantId) => {
    setTenantEmployees((prev) => ({ ...prev, [tenantId]: { loading: true, error: null, rows: null } }));
    setTenantDoctors((prev) => ({ ...prev, [tenantId]: { loading: true, error: null, rows: null } }));
    api
      .get(`/dashboard/tenants/${tenantId}/employees`)
      .then((res) => {
        setTenantEmployees((prev) => ({
          ...prev,
          [tenantId]: { loading: false, error: null, rows: res.data.employees || [] },
        }));
      })
      .catch((err) => {
        setTenantEmployees((prev) => ({
          ...prev,
          [tenantId]: {
            loading: false,
            error: err.response?.data?.message || "Failed to load employees",
            rows: null,
          },
        }));
      });
    api
      .get(`/dashboard/tenants/${tenantId}/doctors`)
      .then((res) => {
        setTenantDoctors((prev) => ({
          ...prev,
          [tenantId]: { loading: false, error: null, rows: res.data.doctors || [] },
        }));
      })
      .catch((err) => {
        setTenantDoctors((prev) => ({
          ...prev,
          [tenantId]: {
            loading: false,
            error: err.response?.data?.message || "Failed to load doctors",
            rows: null,
          },
        }));
      });
    api
      .get("/roles", { headers: { "X-Tenant-Id": tenantId } })
      .then((res) => {
        setRolesByTenant((prev) => ({ ...prev, [tenantId]: Array.isArray(res.data) ? res.data : [] }));
      })
      .catch(() => {
        setRolesByTenant((prev) => ({ ...prev, [tenantId]: [] }));
      });
  };

  const toggleTenant = (tenantId) => {
    setExpandedTenant((prev) => (prev === tenantId ? null : tenantId));
  };

  // Refresh the open tenant row on mount-adjacent events: expanding a tenant
  // and every background refresh (window focus / tab visible) re-reads it, so
  // edits made in another role's session are never served from stale state.
  useEffect(() => {
    if (expandedTenant) loadRows(expandedTenant);
  }, [expandedTenant, refreshTick]);

  const startEdit = (tenantId, emp) => {
    setEditingKey(`${tenantId}:${emp.userId}`);
    setEditForm({
      empCode: emp.empCode || "",
      roleIds: (emp.roleIds || []).map((r) => String(r)),
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditForm({ empCode: "", roleIds: [] });
  };

  const toggleRole = (roleId) => {
    const id = String(roleId);
    setEditForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(id)
        ? prev.roleIds.filter((r) => r !== id)
        : [...prev.roleIds, id],
    }));
  };

  const rolesChanged = (emp) => {
    const before = (emp.roleIds || []).map((r) => String(r)).join(",");
    const after = editForm.roleIds.join(",");
    return before !== after;
  };

  const saveEdit = async (tenantId, emp) => {
    setSavingEmp(true);
    try {
      await api.patch(
        `/users/${emp.userId}`,
        { empCode: editForm.empCode.trim(), roleIds: editForm.roleIds },
        { headers: { "X-Tenant-Id": tenantId } },
      );
      if (rolesChanged(emp)) {
        try {
          await api.post("/org/roles/auto-detect", {}, { headers: { "X-Tenant-Id": tenantId } });
        } catch {
          // recompute is best-effort; the user update already succeeded
        }
      }
      showToast(`${emp.name} updated`, "success");
      cancelEdit();
      if (onReload) await onReload();
      loadRows(tenantId);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to update employee", "error");
    } finally {
      setSavingEmp(false);
    }
  };

  const cols = 8;

  return (
    <section className="wf-dash-card wf-tenants-card">
      <header className="wf-card-head wf-tenants-head">
        <div className="wf-tenants-headcopy">
          <h2 className="wf-card-title">All tenants</h2>
          <p className="wf-card-sub">Select a tenant to see its people, doctors, and forms</p>
        </div>
        <Link className="wf-btn wf-btn--light wf-tenants-all" to="/app/tenants">
          View all tenants
          <IconArrow />
        </Link>
      </header>

      <div className="wf-table-wrap">
        <table className="wf-tenants-table">
          <thead>
            <tr>
              <th className="wf-c-tenant">Tenant</th>
              <th className="wf-c-plan">Plan</th>
              <th className="wf-c-status">Status</th>
              <th className="wf-c-people">People</th>
              <th className="wf-c-doctors">Doctors</th>
              <th className="wf-c-forms">Forms</th>
              <th className="wf-c-activity">Last activity</th>
              <th className="wf-c-meta">Details</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={cols} className="dash-empty">No tenants yet</td>
              </tr>
            )}
            {tenants.map((t) => {
              const expanded = expandedTenant === t.tenantId;
              const empState = tenantEmployees[t.tenantId];
              const docState = tenantDoctors[t.tenantId];
              const status = statusMeta(t.status);
              const people = Number(t.employeeCount) || 0;
              const doctors = Number(t.doctorCount) || 0;
              return (
                <Fragment key={t.tenantId}>
                  <tr
                    className={`wf-tenant-row${expanded ? " is-open" : ""}`}
                    onClick={() => toggleTenant(t.tenantId)}
                  >
                    <td className="wf-c-tenant">
                      <ExpandToggle expanded={expanded} label={t.name} />
                    </td>
                    <td className="wf-c-plan">{capitalizeWord(t.plan)}</td>
                    <td className="wf-c-status">
                      <span className={`dash-status dash-status--${status.mod}`}>{status.text}</span>
                    </td>
                    <td className="wf-c-people">{t.employeeCount || "—"}</td>
                    <td className="wf-c-doctors">{t.doctorCount || "—"}</td>
                    <td className="wf-c-forms">
                      {t.formCount || 0} created / {t.formSubmittedCount || 0} submitted
                    </td>
                    <td className="wf-c-activity">{tenantLastActivity(t, feed)}</td>
                    <td className="wf-c-meta">
                      {capitalizeWord(t.plan)} · {people} {people === 1 ? "person" : "people"} · {doctors}{" "}
                      {doctors === 1 ? "doctor" : "doctors"}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="wf-expand-row">
                      <td colSpan={cols}>
                        <div className="dash-expand-panel">
                          <SubSection
                            open={isSubOpen(t.tenantId, "employees")}
                            onToggle={() => toggleSub(t.tenantId, "employees")}
                            title={`Employees under ${t.name}`}
                            count={empState?.rows ? empState.rows.length : null}
                          >
                            {empState?.loading && <p className="dash-loading">Loading employees...</p>}
                            {empState?.error && <p className="dash-error">{empState.error}</p>}
                            {empState?.rows && empState.rows.length === 0 && (
                              <p className="dash-empty-text">No employees in this tenant yet.</p>
                            )}
                            {empState?.rows && empState.rows.length > 0 && (
                              <div className="dash-table-wrap">
                                <table className="dash-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Email</th>
                                      <th>Emp Code</th>
                                      <th>Roles</th>
                                      <th>Reports To</th>
                                      <th className="dash-num">Forms Created</th>
                                      <th className="dash-num">Doctors Created</th>
                                      <th>Status</th>
                                      <th className="dash-num">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {empState.rows.map((emp) => {
                                      const status = statusMeta(emp.status);
                                      const isEditing = editingKey === `${t.tenantId}:${emp.userId}`;
                                      const tenantRoles = rolesByTenant[t.tenantId] || [];
                                      return (
                                        <Fragment key={emp.userId}>
                                          <tr>
                                            <td className="dash-td-name dash-emp-name" data-label="Employee">{emp.name}</td>
                                            <td data-label="Email">{emp.email}</td>
                                            <td data-label="Employee code"><code>{emp.empCode || "—"}</code></td>
                                            <td data-label="Roles">{emp.roles}</td>
                                            <td data-label="Reports to">{emp.reportingTo ? emp.reportingTo.name : "Root"}</td>
                                            <td className="dash-num" data-label="Forms created">{emp.formsCreated}</td>
                                            <td className="dash-num" data-label="Doctors created">{emp.usersCreated}</td>
                                            <td data-label="Status">
                                              <span className={`dash-status dash-status--${status.mod}`}>
                                                {status.text}
                                              </span>
                                            </td>
                                            <td className="dash-num" data-label="Actions">
                                              {!isEditing && (
                                                <button
                                                  type="button"
                                                  className="btn-secondary"
                                                  onClick={() => startEdit(t.tenantId, emp)}
                                                >
                                                  Edit
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          {isEditing && (
                                            <tr className="dash-expand-row">
                                              <td colSpan={9}>
                                                <div className="dash-expand-panel">
                                                  <div className="dash-edit-form">
                                                    <label className="dash-edit-field">
                                                      <span>Emp Code</span>
                                                      <input
                                                        type="text"
                                                        value={editForm.empCode}
                                                        onChange={(e) =>
                                                          setEditForm((p) => ({
                                                            ...p,
                                                            empCode: e.target.value,
                                                          }))
                                                        }
                                                        placeholder="Employee code"
                                                      />
                                                    </label>
                                                    <div className="dash-edit-field">
                                                      <span>Roles</span>
                                                      <div className="dash-edit-roles">
                                                        {tenantRoles.length === 0 && (
                                                          <span className="dash-empty-text">
                                                            No roles available
                                                          </span>
                                                        )}
                                                        {tenantRoles.map((role) => (
                                                          <label
                                                            key={role._id}
                                                            className="dash-edit-role-option"
                                                          >
                                                            <input
                                                              type="checkbox"
                                                              checked={editForm.roleIds.includes(
                                                                String(role._id),
                                                              )}
                                                              onChange={() => toggleRole(role._id)}
                                                            />
                                                            {role.name}
                                                          </label>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <div className="dash-edit-actions">
                                                      <button
                                                        type="button"
                                                        className="btn-primary"
                                                        onClick={() => saveEdit(t.tenantId, emp)}
                                                        disabled={savingEmp}
                                                      >
                                                        {savingEmp ? "Saving..." : "Save"}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        onClick={cancelEdit}
                                                        disabled={savingEmp}
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </SubSection>
                          <SubSection
                            open={isSubOpen(t.tenantId, "doctors")}
                            onToggle={() => toggleSub(t.tenantId, "doctors")}
                            title={`Doctors created by ${t.name}`}
                            count={docState?.rows ? docState.rows.length : null}
                          >
                            {docState?.loading && <p className="dash-loading">Loading doctors...</p>}
                            {docState?.error && <p className="dash-error">{docState.error}</p>}
                            {docState?.rows && docState.rows.length === 0 && (
                              <p className="dash-empty-text">No doctors created in this tenant yet.</p>
                            )}
                            {docState?.rows && docState.rows.length > 0 && (
                              <div className="dash-table-wrap">
                                <table className="dash-table dash-table--doctors">
                                  <thead>
                                    <tr>
                                      <th>Doctor Name</th>
                                      <th>Emp Created</th>
                                      <th>Emp Code</th>
                                      <th>Emp Role</th>
                                      <th>Emp Report To</th>
                                      <th className="dash-num">Forms Created</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {docState.rows.map((doc) => (
                                      <tr key={doc.externalUserId}>
                                        <td className="dash-td-name" data-label="Doctor">{doc.name}</td>
                                        <td data-label="Created by">{doc.createdBy ? doc.createdBy.name : "—"}</td>
                                        <td data-label="Employee code"><code>{doc.createdBy?.empCode || "—"}</code></td>
                                        <td data-label="Employee role">{doc.createdBy?.role || "—"}</td>
                                        <td data-label="Reports to">
                                          {doc.createdBy?.reportingTo?.name || "Root"}
                                        </td>
                                        <td className="dash-num" data-label="Forms created">{doc.formsCreated}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </SubSection>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminDashboard({ data, onReload, refreshTick = 0 }) {
  const { summary, employees, doctors = [] } = data;
  const { showToast } = useToast();
  const [collapsedSub, setCollapsedSub] = useState({});
  const [roles, setRoles] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({ empCode: "", roleIds: [] });
  const [saving, setSaving] = useState(false);

  // Roles are re-read on mount and after every background refresh so a role
  // created on the Roles page is available in the edit dialog right away.
  useEffect(() => {
    let active = true;
    api
      .get("/roles")
      .then((res) => {
        if (active) setRoles(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) setRoles([]);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  const isSubOpen = (key) => !collapsedSub[key];
  const toggleSub = (key) =>
    setCollapsedSub((prev) => ({ ...prev, [key]: !prev[key] }));

  const startEdit = (emp) => {
    setEditingUserId(emp.userId);
    setEditForm({
      empCode: emp.empCode || "",
      roleIds: (emp.roleIds || []).map((r) => String(r)),
    });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditForm({ empCode: "", roleIds: [] });
  };

  const toggleRole = (roleId) => {
    const id = String(roleId);
    setEditForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(id)
        ? prev.roleIds.filter((r) => r !== id)
        : [...prev.roleIds, id],
    }));
  };

  const rolesChanged = (emp) => {
    const before = (emp.roleIds || []).map((r) => String(r)).join(",");
    const after = editForm.roleIds.join(",");
    return before !== after;
  };

  const saveEdit = async (emp) => {
    setSaving(true);
    try {
      await api.patch(`/users/${emp.userId}`, {
        empCode: editForm.empCode.trim(),
        roleIds: editForm.roleIds,
      });
      if (rolesChanged(emp)) {
        try {
          await api.post("/org/roles/auto-detect");
        } catch {
          // recompute is best-effort; the user update already succeeded
        }
      }
      showToast(`${emp.name} updated`, "success");
      cancelEdit();
      if (onReload) await onReload();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to update employee", "error");
    } finally {
      setSaving(false);
    }
  };

  const cols = 9;

  return (
    <section className="wf-dash-card wf-sec-card">
      <header className="wf-card-head">
        <h2 className="wf-card-title">Tenant overview</h2>
        <p className="wf-card-sub">
          {summary.totalEmployees} people and {summary.totalDoctors} doctors in this tenant
        </p>
      </header>

      <SubSection
        open={isSubOpen("employees")}
        onToggle={() => toggleSub("employees")}
        title="Employees under the tenant"
        count={employees.length}
      >
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Emp Code</th>
                <th>Roles</th>
                <th>Reports To</th>
                <th className="dash-num">Forms Created</th>
                <th className="dash-num">Doctors Created</th>
                <th>Status</th>
                <th className="dash-num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={cols} className="dash-empty">No employees found</td>
                </tr>
              )}
              {employees.map((emp) => {
                const isEditing = editingUserId === emp.userId;
                return (
                  <Fragment key={emp.userId}>
                    <tr>
                      <td className="dash-td-name dash-emp-name">{emp.name}</td>
                      <td>{emp.email}</td>
                      <td><code>{emp.empCode || "—"}</code></td>
                      <td>{emp.roles}</td>
                      <td>{emp.reportingTo ? emp.reportingTo.name : "Root"}</td>
                      <td className="dash-num">{emp.formsCreated}</td>
                      <td className="dash-num">{emp.usersCreated}</td>
                      <td>
                        <span className={`dash-status dash-status--${(emp.status || "").toLowerCase()}`}>
                          {emp.status || "—"}
                        </span>
                      </td>
                      <td className="dash-num">
                        {!isEditing && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startEdit(emp)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="dash-expand-row">
                        <td colSpan={cols}>
                          <div className="dash-expand-panel">
                            <div className="dash-edit-form">
                              <label className="dash-edit-field">
                                <span>Emp Code</span>
                                <input
                                  type="text"
                                  value={editForm.empCode}
                                  onChange={(e) => setEditForm((p) => ({ ...p, empCode: e.target.value }))}
                                  placeholder="Employee code"
                                />
                              </label>
                              <div className="dash-edit-field">
                                <span>Roles</span>
                                <div className="dash-edit-roles">
                                  {roles.length === 0 && (
                                    <span className="dash-empty-text">No roles available</span>
                                  )}
                                  {roles.map((role) => (
                                    <label key={role._id} className="dash-edit-role-option">
                                      <input
                                        type="checkbox"
                                        checked={editForm.roleIds.includes(String(role._id))}
                                        onChange={() => toggleRole(role._id)}
                                      />
                                      {role.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="dash-edit-actions">
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => saveEdit(emp)}
                                  disabled={saving}
                                >
                                  {saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </SubSection>

      <SubSection
        open={isSubOpen("doctors")}
        onToggle={() => toggleSub("doctors")}
        title="Doctors created by tenant"
        count={doctors.length}
      >
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Doctor Name</th>
                <th>Emp Created</th>
                <th>Emp Code</th>
                <th>Emp Role</th>
                <th>Emp Report To</th>
                <th className="dash-num">Forms Created</th>
              </tr>
            </thead>
            <tbody>
              {doctors.length === 0 && (
                <tr>
                  <td colSpan={6} className="dash-empty">No doctors created in this tenant yet</td>
                </tr>
              )}
              {doctors.map((doc) => (
                <tr key={doc.externalUserId}>
                  <td className="dash-td-name">{doc.name}</td>
                  <td>{doc.createdBy ? doc.createdBy.name : "—"}</td>
                  <td><code>{doc.createdBy?.empCode || "—"}</code></td>
                  <td>{doc.createdBy?.role || "—"}</td>
                  <td>{doc.createdBy?.reportingTo?.name || "Root"}</td>
                  <td className="dash-num">{doc.formsCreated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SubSection>
    </section>
  );
}

function EmployeeDashboard({ data }) {
  const { summary, directReports, usersCreated } = data;

  // Low-level (leaf) employees have no one reporting to them, so the
  // "Employees Under Me" card/section is hidden for them.
  const hasReports = directReports.length > 0;

  return (
    <section className="wf-dash-card wf-sec-card">
      <header className="wf-card-head">
        <h2 className="wf-card-title">My overview</h2>
        <p className="wf-card-sub">
          {summary.formsCreated} forms created · {summary.usersCreated} doctors onboarded
        </p>
      </header>

      {hasReports && (
        <SubSection
          open
          onToggle={() => {}}
          title="Employees Under Me"
          count={directReports.length}
        >
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Emp Code</th>
                  <th>Roles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {directReports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="dash-empty">You have no direct reports</td>
                  </tr>
                )}
                {directReports.map((r) => (
                  <tr key={r.userId}>
                    <td className="dash-td-name dash-emp-name">{r.name}</td>
                    <td>{r.email}</td>
                    <td><code>{r.empCode || "—"}</code></td>
                    <td>{r.roles}</td>
                    <td>
                      <span className={`dash-status dash-status--${(r.status || "").toLowerCase()}`}>
                        {r.status || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SubSection>
      )}

      <SubSection open onToggle={() => {}} title="Doctors I onboarded" count={usersCreated.length}>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Emp Code</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {usersCreated.length === 0 && (
                <tr>
                  <td colSpan={5} className="dash-empty">You have not onboarded any doctors yet</td>
                </tr>
              )}
              {usersCreated.map((u) => (
                <tr key={u.userId}>
                  <td className="dash-td-name">{u.name}</td>
                  <td>{u.email}</td>
                  <td><code>{u.empCode || "—"}</code></td>
                  <td>
                    <span className={`dash-status dash-status--${(u.status || "").toLowerCase()}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SubSection>
    </section>
  );
}

function DashboardPage() {
  const { user, isSuperAdmin: authSuperAdmin, accountRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped on every background refresh so child dashboards can re-fetch the
  // lists they own (roles, expanded tenant rows) instead of serving stale state.
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/dashboard/stats");
      setData(res.data);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
    load({ silent: true });
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // The dashboard used to fetch only on mount, so a change made by another
  // role was invisible until a full reload. Refetch whenever the tab regains
  // focus or becomes visible again (both events fire together, so they are
  // coalesced into a single refresh).
  useEffect(() => {
    let lastRun = 0;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRun < 1500) return;
      lastRun = now;
      refresh();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [refresh]);

  const isSuperAdmin = data ? data.role === "super_admin" : Boolean(authSuperAdmin);
  const model = useMemo(() => buildDashboardModel(data), [data]);
  const feed = usePlatformActivity(data);
  const activity = useRecentActivity();

  const statCards = useMemo(() => buildStatCards(data, feed), [data, feed]);
  const series = useMemo(() => buildWeekSeries(feed), [feed]);
  const attention = useMemo(() => buildAttentionItems(data), [data]);

  const firstName = String(user?.name || data?.currentUser?.name || "")
    .trim()
    .split(/\s+/)[0];
  const audience = isSuperAdmin
    ? "Platform admin"
    : firstName || (data?.role === "tenant_admin" || accountRole === "tenant_admin" ? "Admin" : "Employee");
  const now = new Date();
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const greeting = `${now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"}, ${audience}`;

  const primary = isSuperAdmin
    ? { label: "Create a tenant", to: "/app/tenants" }
    : data?.role === "tenant_admin" || accountRole === "tenant_admin"
      ? { label: "Add employee", to: "/app/employee-management" }
      : null;

  return (
    <section className="wf-dash">
      <header className="wf-head">
        <div className="wf-head-copy">
          <p className="wf-head-date">{dateLine}</p>
          <h1 className="wf-head-title">{greeting}</h1>
          <p className="wf-head-lede">Here&rsquo;s what needs your attention today.</p>
        </div>
        <HeaderButtons
          primary={primary}
          onDownload={() => model && downloadReport(model.report)}
          ready={Boolean(model?.report?.rows?.length)}
        />
      </header>

      {loading ? <p className="wf-state">Loading dashboard...</p> : null}
      {error ? <p className="wf-state wf-state--error">{error}</p> : null}

      {!loading && !error && data && model ? (
        <>
          <StatCards cards={statCards} />

          <div className={`wf-mid${attention.length ? "" : " wf-mid--solo"}`}>
            <HappeningCard series={series} activity={activity} />
            <AttentionCard items={attention} />
          </div>

          {isSuperAdmin ? (
            <SuperAdminDashboard data={data} feed={feed} onReload={load} refreshTick={refreshTick} />
          ) : data.role === "tenant_admin" ? (
            <AdminDashboard data={data} onReload={load} refreshTick={refreshTick} />
          ) : (
            <EmployeeDashboard data={data} />
          )}

          <p className="wf-foot">
            <i className="wf-dot wf-dot--green" aria-hidden="true" />
            Pinktech Platform &bull; Data refreshed just now
          </p>
        </>
      ) : null}
    </section>
  );
}

export default DashboardPage;
