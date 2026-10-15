import api from "../../lib/api";

/**
 * Absolute URL for a stored path. Public form links (/public/...) are SPA
 * routes served by the frontend origin — the API gateway answers them with
 * 401 "Missing access token". API routes (/api/...) use the API origin.
 */
export function appUrl(path) {
  if (!path) return "";
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith("/public/")) {
    return `${window.location.origin}${path}`;
  }
  try {
    const origin = new URL(api.defaults.baseURL).origin;
    return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
  } catch {
    return path;
  }
}
