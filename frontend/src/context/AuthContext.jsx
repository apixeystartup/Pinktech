import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { registerAuthBridge } from "../lib/api";
import AuthContext from "./auth-context";

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("accessToken"));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("refreshToken"));
  const [tenantContextId, setTenantContextId] = useState(localStorage.getItem("tenantContextId") || "");
  const [user, setUser] = useState(
    localStorage.getItem("authUser") ? JSON.parse(localStorage.getItem("authUser")) : null,
  );
  const [permissionCodes, setPermissionCodes] = useState(
    localStorage.getItem("permissionCodes")
      ? JSON.parse(localStorage.getItem("permissionCodes"))
      : [],
  );
  const [currentTenant, setCurrentTenant] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const applySessionPayload = useCallback((data) => {
    const baseUser = data?.user ?? null;
    const codes = data?.permissionCodes ?? [];
    if (baseUser) {
      const nextUser = { ...baseUser, tenantId: baseUser.tenantId };
      localStorage.setItem("authUser", JSON.stringify(nextUser));
      setUser(nextUser);
    }
    localStorage.setItem("permissionCodes", JSON.stringify(codes));
    setPermissionCodes(codes);
  }, []);

  const refreshSession = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    try {
      const res = await api.get("/auth/me");
      applySessionPayload(res.data);
    } catch {
      /* ignore — offline or transient */
    }
  }, [applySessionPayload]);

  useEffect(() => {
    if (!accessToken) {
      setCurrentTenant(null);
      return undefined;
    }
    let active = true;
    api
      .get("/tenants/current")
      .then((res) => {
        if (active) setCurrentTenant(res.data || null);
      })
      .catch(() => {
        if (active) setCurrentTenant(null);
      });
    return () => {
      active = false;
    };
  }, [accessToken, tenantContextId]);

  useEffect(() => {
    if (!accessToken) return undefined;
    refreshSession();
    let debounceTimer;
    const scheduleRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshSession(), 280);
    };
    window.addEventListener("pink:auth-refresh", refreshSession);
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener("pink:auth-refresh", refreshSession);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
    };
  }, [accessToken, refreshSession]);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const response = await api.post("/auth/login", { email, password });
      const token = response.data?.accessToken;
      const nextRefreshToken = response.data?.refreshToken;
      const baseUser = response.data?.user || null;
      const org = response.data?.tenant;
      const nextUser =
        baseUser && org ? { ...baseUser, tenantId: baseUser.tenantId || org._id } : baseUser;
      const nextPermissionCodes = response.data?.permissionCodes || [];

      if (!token || !nextRefreshToken) {
        throw new Error("Access token not returned by API.");
      }

      localStorage.setItem("accessToken", token);
      localStorage.setItem("refreshToken", nextRefreshToken);
      localStorage.setItem("authUser", JSON.stringify(nextUser));
      localStorage.setItem("permissionCodes", JSON.stringify(nextPermissionCodes));
      localStorage.removeItem("tenantContextId");
      setAccessToken(token);
      setRefreshToken(nextRefreshToken);
      setUser(nextUser);
      setPermissionCodes(nextPermissionCodes);
      setTenantContextId("");
      if (org) setCurrentTenant(org);
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  const setTokens = ({ accessToken: nextAccessToken, refreshToken: nextRefreshToken }) => {
    localStorage.setItem("accessToken", nextAccessToken);
    localStorage.setItem("refreshToken", nextRefreshToken);
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
  };

  const setTenantContext = (nextTenantId) => {
    const value = nextTenantId || "";
    if (value) {
      localStorage.setItem("tenantContextId", value);
    } else {
      localStorage.removeItem("tenantContextId");
    }
    setTenantContextId(value);
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    localStorage.removeItem("permissionCodes");
    localStorage.removeItem("tenantContextId");
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setPermissionCodes([]);
    setTenantContextId("");
    setCurrentTenant(null);
  };

  registerAuthBridge({
    getRefreshToken: () => refreshToken,
    getTenantContext: () => tenantContextId || null,
    clearTenantContext: () => setTenantContext(""),
    setTokens,
    logout,
  });

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      user,
      tenantContextId,
      currentTenant,
      permissionCodes,
      isAuthenticated: Boolean(accessToken),
      isLoading,
      login,
      setTenantContext,
      setTokens,
      logout,
      refreshSession,
    }),
    [accessToken, refreshToken, user, tenantContextId, currentTenant, permissionCodes, isLoading, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
