import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import useAuth from "../hooks/useAuth";

function Skeleton() {
  return <span className="dashboard-stat-skeleton" />;
}

function StatCard({ label, count, to, color, loading }) {
  return (
    <Link to={to} className="dashboard-stat-card" style={{ "--stat-color": color }}>
      <div className="dashboard-stat-count">{loading ? <Skeleton /> : (count ?? 0)}</div>
      <div className="dashboard-stat-label">{label}</div>
    </Link>
  );
}

function ActivityItem({ entry }) {
  const actionLabels = {
    AUTH_LOGIN: "logged in",
    TENANT_CREATED: "created tenant",
    TENANT_UPDATED: "updated tenant",
    TENANT_CREDENTIALS_SENT: "sent credentials",
    USER_INVITED: "invited user",
    USER_UPDATED: "updated user",
    ROLE_CREATED: "created role",
    ROLE_UPDATED: "updated role",
    FORM_DISPATCHED: "dispatched form",
    KYC_VERIFIED: "verified KYC",
    APPROVAL_ACTED: "acted on approval",
    SCHEMA_FORM_SUBMITTED: "submitted form",
  };
  const label = actionLabels[entry.action] || entry.action?.toLowerCase().replace(/_/g, " ");
  const userName = entry.userId?.name || "System";
  const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "";

  return (
    <li className="dashboard-activity-item">
      <span className="dashboard-activity-action">{label}</span>
      <span className="dashboard-activity-user">{userName}</span>
      <span className="dashboard-activity-time">{time}</span>
    </li>
  );
}

function SuperAdminDashboard({ stats, loading }) {
  const t = stats?.tenants || {};
  const u = stats?.users || {};
  const s = stats?.submissions || {};
  const k = stats?.kyc || {};

  return (
    <>
      <p className="module-page-desc">
        Platform-wide overview of all tenants and activity across Approve.io.
      </p>

      <div className="dashboard-stats-grid">
        <StatCard label="Total Tenants" count={t.total} to="/tenants" color="#4f46e5" loading={loading} />
        <StatCard label="Active Tenants" count={t.active} to="/tenants" color="#059669" loading={loading} />
        <StatCard label="Suspended" count={t.suspended} to="/tenants" color="#dc2626" loading={loading} />
        <StatCard label="Total Users" count={u.total} to="/tenants" color="#7c3aed" loading={loading} />
        <StatCard label="Active Users" count={u.active} to="/tenants" color="#0891b2" loading={loading} />
        <StatCard label="Invited" count={u.invited} to="/tenants" color="#d97706" loading={loading} />
        <StatCard label="Submissions" count={s.total} to="/tenants" color="#6366f1" loading={loading} />
        <StatCard label="Pending KYC" count={k.pending} to="/tenants" color="#e11d48" loading={loading} />
      </div>

      {t.recent?.length > 0 && (
        <div className="dashboard-section">
          <h3>Recent Tenants</h3>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {t.recent.map((ten) => (
                  <tr key={ten._id}>
                    <td>{ten.name}</td>
                    <td><code>{ten.code}</code></td>
                    <td><span className={`badge badge-${ten.status === "ACTIVE" ? "success" : "danger"}`}>{ten.status}</span></td>
                    <td>{ten.plan}</td>
                    <td>{ten.createdAt ? new Date(ten.createdAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function TenantAdminDashboard({ stats, loading }) {
  const e = stats?.employees || {};
  const d = stats?.dispatches || {};
  const s = stats?.submissions || {};
  const k = stats?.kyc || {};
  const r = stats?.roles || {};
  const n = stats?.notifications || {};

  return (
    <>
      <p className="module-page-desc">
        Overview of your organization's activity on Approve.io.
      </p>

      <div className="dashboard-section-label">People</div>
      <div className="dashboard-stats-grid">
        <StatCard label="Total Employees" count={e.total} to="/people" color="#4f46e5" loading={loading} />
        <StatCard label="Active" count={e.active} to="/people" color="#059669" loading={loading} />
        <StatCard label="Invited" count={e.invited} to="/people" color="#d97706" loading={loading} />
        <StatCard label="Disabled" count={e.disabled} to="/people" color="#dc2626" loading={loading} />
        <StatCard label="Roles" count={r.total} to="/roles" color="#7c3aed" loading={loading} />
      </div>

      <div className="dashboard-section-label">Workflow</div>
      <div className="dashboard-stats-grid">
        <StatCard label="Dispatched" count={d.total} to="/form-dispatch-approvals" color="#0891b2" loading={loading} />
        <StatCard label="Awaiting Approval" count={d.inApproval} to="/form-dispatch-approvals" color="#d97706" loading={loading} />
        <StatCard label="Approved" count={d.approved} to="/form-dispatch-approvals" color="#059669" loading={loading} />
        <StatCard label="Submissions" count={s.total} to="/workflows" color="#6366f1" loading={loading} />
        <StatCard label="Pending" count={s.pending} to="/workflows" color="#e11d48" loading={loading} />
      </div>

      <div className="dashboard-section-label">Compliance</div>
      <div className="dashboard-stats-grid">
        <StatCard label="External Users" count={k.externalUsers} to="/kyc" color="#4f46e5" loading={loading} />
        <StatCard label="Pending KYC" count={k.pending} to="/kyc" color="#dc2626" loading={loading} />
        <StatCard label="Verified KYC" count={k.verified} to="/kyc" color="#059669" loading={loading} />
      </div>

      <div className="dashboard-section-label">Notifications</div>
      <div className="dashboard-stats-grid">
        <StatCard label="Sent" count={n.total} to="/notifications" color="#6366f1" loading={loading} />
        <StatCard label="Failed" count={n.failed} to="/notifications" color="#dc2626" loading={loading} />
      </div>
    </>
  );
}

function EmployeeDashboard({ stats, loading }) {
  const t = stats?.team || {};
  const s = stats?.submissions || {};
  const a = stats?.approvals || {};
  const n = stats?.notifications || {};

  return (
    <>
      <p className="module-page-desc">
        Your personal workspace on Approve.io.
      </p>

      <div className="dashboard-section-label">My Work</div>
      <div className="dashboard-stats-grid">
        <StatCard label="My Submissions" count={s.total} to="/workflows" color="#4f46e5" loading={loading} />
        <StatCard label="Pending" count={s.pending} to="/workflows" color="#d97706" loading={loading} />
        <StatCard label="Completed" count={s.completed} to="/workflows" color="#059669" loading={loading} />
        <StatCard label="Pending Approvals" count={a.pending} to="/form-dispatch-approvals" color="#e11d48" loading={loading} />
        <StatCard label="Unread Notifications" count={n.unread} to="/notifications" color="#6366f1" loading={loading} />
      </div>

      {t.directReports > 0 && (
        <>
          <div className="dashboard-section-label">My Team</div>
          <div className="dashboard-stats-grid">
            <StatCard label="Direct Reports" count={t.directReports} to="/people" color="#0891b2" loading={loading} />
            <StatCard label="Active in Team" count={t.totalActive} to="/people" color="#059669" loading={loading} />
          </div>
        </>
      )}
    </>
  );
}

function DashboardPage() {
  const { permissionCodes = [], user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = permissionCodes.includes("tenant.manage");

  useEffect(() => {
    let active = true;
    async function fetchStats() {
      try {
        const res = await api.get("/dashboard/stats");
        if (active) {
          setStats(res.data);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }
    fetchStats();
    return () => { active = false; };
  }, []);

  const role = stats?.role || (isAdmin ? "tenant_admin" : "employee");
  const greeting = user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Dashboard";

  return (
    <section className="module-page">
      <h2>{greeting}</h2>

      {loading ? (
        <div className="dashboard-stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dashboard-stat-card" style={{ "--stat-color": "#94a3b8" }}>
              <div className="dashboard-stat-count"><Skeleton /></div>
              <div className="dashboard-stat-label">&nbsp;</div>
            </div>
          ))}
        </div>
      ) : role === "super_admin" ? (
        <SuperAdminDashboard stats={stats} loading={loading} />
      ) : role === "tenant_admin" ? (
        <TenantAdminDashboard stats={stats} loading={loading} />
      ) : (
        <EmployeeDashboard stats={stats} loading={loading} />
      )}

      {stats?.recentActivity?.length > 0 && (
        <div className="dashboard-section">
          <h3>Recent Activity</h3>
          <ul className="dashboard-activity-list">
            {stats.recentActivity.map((entry, i) => (
              <ActivityItem key={entry._id || i} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default DashboardPage;
