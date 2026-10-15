import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { isAdminRole } from "../lib/access-control";

function ProtectedRoute({ children, requiredPermissions = [], requireSuperAdmin = false, requireAdmin = false }) {
  const { isAuthenticated, permissionCodes = [], isSuperAdmin, accountRole } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  if (requireAdmin && !isAdminRole(accountRole, isSuperAdmin)) {
    return <Navigate to="/access-denied" replace />;
  }

  if (requiredPermissions.length > 0) {
    const allowed = permissionCodes.includes("*") || requiredPermissions.some((code) => permissionCodes.includes(code));
    if (!allowed) {
      return <Navigate to="/access-denied" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;
