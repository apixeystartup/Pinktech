import { useEffect, useState } from "react";
import useAuth from "../hooks/useAuth";
import api from "../lib/api";

function StatCard({ label, value, sub }) {
  return (
    <div className="dash-stat-card">
      <span className="dash-stat-value">{value ?? "—"}</span>
      <span className="dash-stat-label">{label}</span>
      {sub ? <span className="dash-stat-sub">{sub}</span> : null}
    </div>
  );
}

function SuperAdminDashboard({ data }) {
  const { summary, tenants } = data;
  return (
    <div className="dash-role-view">
      <h3 className="dash-section-title">Platform Overview</h3>
      <div className="dash-stats-grid">
        <StatCard label="Total Tenants" value={summary.totalTenants} />
        <StatCard label="Total Employees" value={summary.totalEmployees} />
        <StatCard label="Total Users" value={summary.totalUsers} />
      </div>

      <h3 className="dash-section-title">Tenant Breakdown</h3>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Code</th>
              <th>Plan</th>
              <th>Status</th>
              <th className="dash-num">Employees</th>
              <th className="dash-num">Users</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="dash-empty">No tenants yet</td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.tenantId}>
                <td className="dash-td-name">{t.name}</td>
                <td><code>{t.code}</code></td>
                <td><span className="dash-badge">{t.plan}</span></td>
                <td>
                  <span className={`dash-status dash-status--${t.status?.toLowerCase()}`}>
                    {t.status}
                  </span>
                </td>
                <td className="dash-num">{t.employeeCount}</td>
                <td className="dash-num">{t.userCount}</td>
                <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantAdminDashboard({ data }) {
  const { summary, employees } = data;
  const [expandedEmployee, setExpandedEmployee] = useState(null);

  const toggleExpand = (userId) => {
    setExpandedEmployee(expandedEmployee === userId ? null : userId);
  };

  return (
    <div className="dash-role-view">
      <h3 className="dash-section-title">Tenant Overview</h3>
      <div className="dash-stats-grid">
        <StatCard label="Total Employees" value={summary.totalEmployees} />
        <StatCard label="Total Users Created" value={summary.totalUsers} />
      </div>

      <h3 className="dash-section-title">Employee Directory</h3>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Emp Code</th>
              <th>Roles</th>
              <th>Reports To</th>
              <th className="dash-num">Users Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="dash-empty">No employees found</td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.userId} className={expandedEmployee === emp.userId ? "dash-row-expanded" : ""}>
                <td className="dash-td-name">{emp.name}</td>
                <td>{emp.email}</td>
                <td><code>{emp.empCode || "—"}</code></td>
                <td>{emp.roles || "—"}</td>
                <td>{emp.reportingTo ? emp.reportingTo.name : "Root"}</td>
                <td className="dash-num">
                  <span className={`dash-count-badge ${emp.directReportCount > 0 ? "dash-count-badge--active" : ""}`}>
                    {emp.directReportCount}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => toggleExpand(emp.userId)}
                  >
                    {expandedEmployee === emp.userId ? "Hide" : "Users"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeDashboard({ data }) {
  const { summary, currentUser, directReports, managedUsers, subtreeStats } = data;
  const [selectedReport, setSelectedReport] = useState("");
  const [filterText, setFilterText] = useState("");

  const filteredUsers = managedUsers.filter((u) => {
    const q = filterText.toLowerCase();
    return (
      !q ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.empCode || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="dash-role-view">
      <h3 className="dash-section-title">My Overview</h3>
      <div className="dash-stats-grid">
        <StatCard label="Direct Reports" value={directReports.length} />
        <StatCard label="Users in My Team" value={subtreeStats.totalUsersManaged} />
        <StatCard label="Total Reports (Sub-tree)" value={subtreeStats.totalReports} />
      </div>

      {currentUser && (
        <div className="dash-profile-card">
          <span className="dash-profile-label">Logged in as</span>
          <span className="dash-profile-name">{currentUser.name}</span>
          <span className="dash-profile-email">{currentUser.email}</span>
          {currentUser.empCode ? <span className="dash-profile-code">ID: {currentUser.empCode}</span> : null}
        </div>
      )}

      <h3 className="dash-section-title">My Direct Reports</h3>
      {directReports.length === 0 ? (
        <p className="dash-empty-text">You have no direct reports.</p>
      ) : (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Emp Code</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {directReports.map((r) => (
                <tr key={r.userId}>
                  <td className="dash-td-name">{r.name}</td>
                  <td>{r.email}</td>
                  <td><code>{r.empCode || "—"}</code></td>
                  <td>{r.roles || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="dash-section-title">Users I Manage</h3>
      <div className="dash-controls">
        <select
          className="dash-select"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            setFilterText("");
          }}
        >
          <option value="">All managed users ({managedUsers.length})</option>
          {directReports.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name} ({r.email})
            </option>
          ))}
        </select>
        <input
          type="text"
          className="dash-search"
          placeholder="Search by name, email, or code..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Emp Code</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="dash-empty">No users found</td>
              </tr>
            )}
            {filteredUsers.map((u) => (
              <tr key={u.userId}>
                <td className="dash-td-name">{u.name}</td>
                <td>{u.email}</td>
                <td><code>{u.empCode || "—"}</code></td>
                <td>
                  <span className={`dash-status dash-status--${(u.status || "").toLowerCase()}`}>
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { user, permissionCodes } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get("/dashboard/stats")
      .then((res) => {
        if (active) {
          setData(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.message || "Failed to load dashboard");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const isSuperAdmin = permissionCodes.includes("*");
  const roleLabel = isSuperAdmin ? "Super Admin" : data?.role === "tenant_admin" ? "Tenant Admin" : "Employee";

  return (
    <section className="module-page">
      <div className="dash-header">
        <div>
          <h2>Dashboard</h2>
          <p className="dash-subtitle">
            Welcome back{user?.name ? `, ${user.name}` : ""} &mdash; {roleLabel}
          </p>
        </div>
      </div>

      {loading && <p className="dash-loading">Loading dashboard...</p>}
      {error && <p className="dash-error">{error}</p>}

      {!loading && !error && data && (
        <>
          {isSuperAdmin || data.role === "super_admin" ? (
            <SuperAdminDashboard data={data} />
          ) : data.role === "tenant_admin" ? (
            <TenantAdminDashboard data={data} />
          ) : (
            <EmployeeDashboard data={data} />
          )}
        </>
      )}
    </section>
  );
}

export default DashboardPage;
