import { getRbacHbacGuidance } from "../lib/access-control";

function DashboardPage() {
  const modules = [
    "Tenants",
    "Roles",
    "ORG employee",
    "Permissions",
    "Assignments",
    "Workflows",
    "Forms",
    "KYC",
    "Notifications",
    "Audit",
  ];

  const guidance = getRbacHbacGuidance();

  return (
    <section className="module-page">
      <h2>Dashboard</h2>
      <p>All backend modules now have frontend entry points in the left navigation.</p>
      <ul>
        {guidance.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="dashboard-grid">
        {modules.map((item) => (
          <div key={item} className="dashboard-card">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default DashboardPage;
