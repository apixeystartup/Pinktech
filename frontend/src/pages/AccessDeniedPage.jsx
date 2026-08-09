import { Link } from "react-router-dom";

function AccessDeniedPage() {
  return (
    <div className="error-page">
      <div className="error-page-icon error-page-icon--warning">!</div>
      <h2>Access denied</h2>
      <p>You are authenticated, but your current permission set does not allow this page.</p>
      <Link to="/" className="btn-primary">Go to dashboard</Link>
    </div>
  );
}

export default AccessDeniedPage;
