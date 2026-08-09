/** Notify AuthProvider to pull fresh profile from GET /auth/me (same tab). */
export function requestSessionRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("pink:auth-refresh"));
}
