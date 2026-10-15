import { Fragment, useCallback, useEffect, useState } from "react";
import useAuth from "../hooks/useAuth";
import api from "../lib/api";
import { useToast } from "../components/common/ToastProvider";

function StatCard({ label, value, sub }) {
  return (
    <div className="dash-stat-card">
      <span className="dash-stat-value">{value ?? "—"}</span>
      <span className="dash-stat-label">{label}</span>
      {sub ? <span className="dash-stat-sub">{sub}</span> : null}
    </div>
  );
}

function ExpandToggle({ expanded, label }) {
  return (
    <span className="dash-expand-toggle">
      <span className={`dash-expand-caret ${expanded ? "dash-expand-caret--open" : ""}`}>&#9654;</span>
      <span className="dash-expand-text">{label}</span>
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
  return { text: status || "—", mod: key ? key.toLowerCase() : "unknown" };
}

function SuperAdminDashboard({ data, onReload, refreshTick = 0 }) {
  const { summary, tenants } = data;
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
    <div className="dash-role-view">
      <div className="dash-stats-grid">
        <StatCard label="Total Tenants" value={summary.totalTenants} />
        <StatCard label="Total Doctors" value={summary.totalDoctors} />
        <StatCard label="Forms Created" value={summary.totalForms} />
        <StatCard label="Forms Submitted" value={summary.formsSubmitted} />
      </div>

      <h3 className="dash-section-title">
        All Tenants &mdash; click a tenant to view its employees & doctors
      </h3>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Plan</th>
              <th>Status</th>
              <th className="dash-num">Emps</th>
              <th className="dash-num">Doctors Created</th>
              <th className="dash-num">Forms Created</th>
              <th className="dash-num">Forms Submitted</th>
              <th>Start Date</th>
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
              return (
                <Fragment key={t.tenantId}>
                  <tr
                    className={`dash-row-clickable ${expanded ? "dash-row-expanded" : ""}`}
                    onClick={() => toggleTenant(t.tenantId)}
                  >
                    <td className="dash-td-name">
                      <ExpandToggle expanded={expanded} label={t.name} />
                    </td>
                    <td><span className="dash-badge">{t.plan}</span></td>
                    <td>
                      <span className={`dash-status dash-status--${t.status?.toLowerCase()}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="dash-num">{t.employeeCount || "—"}</td>
                    <td className="dash-num">{t.doctorCount || "—"}</td>
                    <td className="dash-num">{t.formCount || "—"}</td>
                    <td className="dash-num">{t.formSubmittedCount || "—"}</td>
                    <td>{t.startDate ? new Date(t.startDate).toLocaleDateString() : "—"}</td>
                  </tr>
                  {expanded && (
                    <tr className="dash-expand-row">
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
                                            <td className="dash-td-name dash-emp-name">{emp.name}</td>
                                            <td>{emp.email}</td>
                                            <td><code>{emp.empCode || "—"}</code></td>
                                            <td>{emp.roles}</td>
                                            <td>{emp.reportingTo ? emp.reportingTo.name : "Root"}</td>
                                            <td className="dash-num">{emp.formsCreated}</td>
                                            <td className="dash-num">{emp.usersCreated}</td>
                                            <td>
                                              <span className={`dash-status dash-status--${status.mod}`}>
                                                {status.text}
                                              </span>
                                            </td>
                                            <td className="dash-num">
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
                                        <td className="dash-td-name">{doc.name}</td>
                                        <td>{doc.createdBy ? doc.createdBy.name : "—"}</td>
                                        <td><code>{doc.createdBy?.empCode || "—"}</code></td>
                                        <td>{doc.createdBy?.role || "—"}</td>
                                        <td>
                                          {doc.createdBy?.reportingTo?.name || "Root"}
                                        </td>
                                        <td className="dash-num">{doc.formsCreated}</td>
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
    </div>
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
    <div className="dash-role-view">
      <h3 className="dash-section-title">Tenant Overview</h3>
      <div className="dash-stats-grid">
        <StatCard label="Total Employees" value={summary.totalEmployees} />
        <StatCard label="Doctors Created" value={summary.totalDoctors} />
        <StatCard label="Forms Created" value={summary.formsCreated} />
        <StatCard label="Forms Submitted" value={summary.formsSubmitted} />
      </div>

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
                                  onChange={(e) =>
                                    setEditForm((p) => ({ ...p, empCode: e.target.value }))
                                  }
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
    </div>
  );
}

function EmployeeDashboard({ data }) {
  const { summary, directReports, usersCreated } = data;

  // Low-level (leaf) employees have no one reporting to them, so the
  // "Employees Under Me" card/section is hidden for them.
  const hasReports = directReports.length > 0;

  return (
    <div className="dash-role-view">
      <h3 className="dash-section-title">My Overview</h3>
      <div className="dash-stats-grid">
        {hasReports && <StatCard label="Employees Under Me" value={summary.directReports} />}
        <StatCard label="Doctors I onboarded" value={summary.usersCreated} />
      </div>

      {hasReports && (
        <>
          <h3 className="dash-section-title">Employees Under Me</h3>
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
        </>
      )}

      <h3 className="dash-section-title">Doctors I onboarded</h3>
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
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
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

  const isSuperAdmin = data?.role === "super_admin";
  const roleLabel = isSuperAdmin ? "Pinktech Super Admin" : data?.role === "tenant_admin" ? "Admin" : "Employee";

  return (
    <section className="module-page">
      <div className="dash-header">
        <div>
          <h2>Dashboard</h2>
          <p className="dash-subtitle">
            Welcome back{user?.name ? `, ${user.name}` : ""} &mdash; {roleLabel}
          </p>
        </div>
        {data?.currentUser && (
          <div className="dash-profile-card">
            <span className="dash-profile-label">Logged in as</span>
            <span className="dash-profile-name">{data.currentUser.name}</span>
            <span className="dash-profile-email">{data.currentUser.email}</span>
            {data.currentUser.empCode ? (
              <span className="dash-profile-code">ID: {data.currentUser.empCode}</span>
            ) : null}
            {data.currentUser.roles && data.currentUser.roles !== "—" ? (
              <span className="dash-profile-code">{data.currentUser.roles}</span>
            ) : null}
          </div>
        )}
      </div>

      {loading && <p className="dash-loading">Loading dashboard...</p>}
      {error && <p className="dash-error">{error}</p>}

      {!loading && !error && data && (
        <>
          {isSuperAdmin ? (
            <SuperAdminDashboard data={data} onReload={load} refreshTick={refreshTick} />
          ) : data.role === "tenant_admin" ? (
            <AdminDashboard data={data} onReload={load} refreshTick={refreshTick} />
          ) : (
            <EmployeeDashboard data={data} />
          )}
        </>
      )}
    </section>
  );
}

export default DashboardPage;
