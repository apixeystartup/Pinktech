import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <div className="not-found">
      <h2>Page not found</h2>
      <p>The page you are looking for does not exist.</p>
      <Link to="/login">Back to login</Link>
    </div>
  );
}

export default NotFoundPage;
