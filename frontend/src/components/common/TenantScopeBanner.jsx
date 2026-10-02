import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import useAuth from "../../hooks/useAuth";

/**
 * Explains which tenant the current API calls apply to. Super admins must use the header
 * "Act as tenant" control (X-Tenant-Id) so roles, positions, and assignments stay isolated per customer.
 */
function TenantScopeBanner({ context = "This page" }) {
  const { user, tenantContextId, currentTenant, permissionCodes = [] } = useAuth();
  const [tenants, setTenants] = useState([]);
  const canManageTenants = permissionCodes.includes("*") || permissionCodes.includes("tenant.manage");

  const effectiveTenantId = useMemo(
    () => String(tenantContextId || user?.tenantId || currentTenant?._id || "").trim(),
    [tenantContextId, user?.tenantId, currentTenant?._id],
  );

  useEffect(() => {
    if (!canManageTenants) {
      setTenants([]);
      return undefined;
    }
    let active = true;
    api
      .get("/tenants")
      .then((res) => {
        if (active) setTenants(res.data || []);
      })
      .catch(() => {
        if (active) setTenants([]);
      });
    return () => {
      active = false;
    };
  }, [canManageTenants]);

  const tenantLabel = useMemo(() => {
    if (currentTenant) {
      return `${currentTenant.name} (${currentTenant.code})`;
    }
    if (!effectiveTenantId) return "Unknown (missing tenant id)";
    const match = tenants.find((t) => String(t._id) === effectiveTenantId);
    if (match) return `${match.name} (${match.code})`;
    return canManageTenants ? `Tenant id ${effectiveTenantId}` : "Your organization";
  }, [currentTenant, effectiveTenantId, tenants, canManageTenants]);

  return (
    <div className="tenant-scope-banner" role="status">
      <p className="tenant-scope-banner-title">
        {context}: data for <strong>{tenantLabel}</strong>
      </p>
      {canManageTenants ? (
        <p className="tenant-scope-banner-hint">
          {tenantContextId
            ? "You are acting as this tenant via the header control. Switch tenants there to work on a different organization."
            : "No tenant override is set, so requests use your home tenant (often the Platform tenant). Choose another tenant in the header to manage that customer in isolation."}
        </p>
      ) : (
        <p className="tenant-scope-banner-hint">
          You are signed in to this organization. Module data uses your account tenant from the server (not the header override).
        </p>
      )}
    </div>
  );
}

export default TenantScopeBanner;
