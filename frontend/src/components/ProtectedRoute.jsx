import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";

function ProtectedRoute({ children, requiredPermissions = [] }) {
  const { isAuthenticated, permissionCodes = [] } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermissions.length > 0) {
    const allowed = requiredPermissions.some((code) => permissionCodes.includes(code));
    if (!allowed) {
      return <Navigate to="/access-denied" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
