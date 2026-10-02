import { Link } from "react-router-dom";

function AccessDeniedPage() {
  return (
    <div className="not-found">
      <h2>Access denied</h2>
      <p>You are authenticated, but your current permission set does not allow this page.</p>
      <Link to="/">Go to dashboard</Link>
    </div>
  );
}

export default AccessDeniedPage;
