import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 15000,
});

let authContextBridge = {
  getRefreshToken: () => null,
  getTenantContext: () => null,
  clearTenantContext: () => {},
  setTokens: () => {},
  logout: () => {},
};

export function registerAuthBridge(bridge) {
  authContextBridge = { ...authContextBridge, ...bridge };
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantContext = authContextBridge.getTenantContext();
  if (tenantContext) {
    config.headers["X-Tenant-Id"] = tenantContext;
  }
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => {
    try {
      const url = response.config?.url || "";
      const method = (response.config?.method || "").toLowerCase();
      if (
        (method === "patch" || method === "put") &&
        /\/users\/[^/]+$/i.test(url.split("?")[0]) &&
        !/\/users\/invite/i.test(url)
      ) {
        window.dispatchEvent(new Event("pink:auth-refresh"));
      }
    } catch {
      /* ignore */
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = authContextBridge.getRefreshToken();
      if (!refreshToken) {
        authContextBridge.logout();
        return Promise.reject(error);
      }

      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
          .then((res) => {
            authContextBridge.setTokens({
              accessToken: res.data.accessToken,
              refreshToken: res.data.refreshToken,
            });
            return res.data.accessToken;
          })
          .catch((refreshError) => {
            authContextBridge.logout();
            throw refreshError;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const nextAccessToken = await refreshPromise;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      return api(originalRequest);
    }

    const message = error.response?.data?.message || "";
    if (status === 403 && message.includes("Target tenant is inactive") && !originalRequest._tenantContextCleared) {
      originalRequest._tenantContextCleared = true;
      authContextBridge.clearTenantContext();
      originalRequest.headers = originalRequest.headers || {};
      delete originalRequest.headers["X-Tenant-Id"];
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export default api;
