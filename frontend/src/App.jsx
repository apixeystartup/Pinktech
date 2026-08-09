import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/common/ToastProvider";
import AppLayout from "./layouts/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import VerifyOtpPage from "./modules/auth/pages/VerifyOtpPage";
import SetPasswordPage from "./modules/auth/pages/SetPasswordPage";
import ForgotPasswordPage from "./modules/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "./modules/auth/pages/ResetPasswordPage";
import TenantsPage from "./modules/tenants/pages/TenantsPage";
import RolesPage from "./modules/roles/pages/RolesPage";
import PermissionsPage from "./modules/permissions/pages/PermissionsPage";
import OrgEmployeePage from "./pages/OrgEmployeePage";
import WorkflowsPage from "./modules/workflows/pages/WorkflowsPage";
import FormDispatchApprovalsPage from "./modules/workflows/pages/FormDispatchApprovalsPage";
import FormsPage from "./modules/forms/pages/FormsPage";
import KycPage from "./modules/kyc/pages/KycPage";
import KycExternalFormsPage from "./modules/kyc/pages/KycExternalFormsPage";
import NotificationsPage from "./modules/notifications/pages/NotificationsPage";
import AuditPage from "./modules/audit/pages/AuditPage";
import EmployeeManagementPage from "./pages/EmployeeManagementPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import { ROUTE_PERMISSIONS } from "./lib/access-control";
import PublicKycVerifyPage from "./pages/PublicKycVerifyPage";
import PublicSchemaFormPage from "./pages/PublicSchemaFormPage";
import PublicSchemaDispatchPage from "./pages/PublicSchemaDispatchPage";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-otp" element={<VerifyOtpPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/public/kyc-verify" element={<PublicKycVerifyPage />} />
            <Route path="/public/schema-forms/dispatch/:token" element={<PublicSchemaDispatchPage />} />
            <Route path="/public/schema-forms/:moduleId" element={<PublicSchemaFormPage />} />
            <Route path="/people" element={<Navigate to="/org-employees" replace />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route
                path="tenants"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/tenants"]}>
                    <TenantsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/roles"]}>
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="org-employees"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/org-employees"]}>
                    <OrgEmployeePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="permissions"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/permissions"]}>
                    <PermissionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employee-management"
                element={
                  <ProtectedRoute requiredPermissions={["user.view"]}>
                    <EmployeeManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="workflows"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/workflows"]}>
                    <WorkflowsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="form-dispatch-approvals"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/form-dispatch-approvals"]}>
                    <FormDispatchApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="forms"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/forms"]}>
                    <FormsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="kyc"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/kyc"]}>
                    <KycPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="kyc-external-forms"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/kyc-external-forms"]}>
                    <KycExternalFormsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="notifications"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/notifications"]}>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit"
                element={
                  <ProtectedRoute requiredPermissions={ROUTE_PERMISSIONS["/audit"]}>
                    <AuditPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/access-denied" element={<AccessDeniedPage />} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
