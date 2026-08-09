import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <div className="error-page">
      <div className="error-page-icon">404</div>
      <h2>Page not found</h2>
      <p>The page you are looking for does not exist or has been moved.</p>
      <Link to="/" className="btn-primary">Back to dashboard</Link>
    </div>
  );
}

export default NotFoundPage;
