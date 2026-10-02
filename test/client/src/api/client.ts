/**
 * Tiny fetch wrapper. Standalone: JWT from /api/bootstrap. Embedded in Pink:
 * uses main app's accessToken + /api/v1/org/* (same contract as test server).
 */

const TOKEN_KEY = 'pink-mern.token';

declare const __PINK_ORG_EMBED__: boolean;
declare const __PINK_API_BASE__: string;

/**
 * Pink admin serves this app at /org-embed/* (iframe, same origin).
 * __PINK_ORG_EMBED__ is set at build time (embed vs standalone) so the Pink API path
 * is not tree-shaken. We also detect by path at runtime as a safety net in dev.
 */
function isPinkEmbed(): boolean {
  if (__PINK_ORG_EMBED__) return true;
  if (typeof window !== 'undefined' && window.location.pathname.includes('/org-embed')) {
    return true;
  }
  return false;
}

let inflightBootstrap: Promise<string> | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function bootstrapToken(): Promise<string> {
  if (inflightBootstrap) return inflightBootstrap;
  inflightBootstrap = (async () => {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) {
      throw new Error(`bootstrap_failed_${res.status}`);
    }
    const json = (await res.json()) as { token: string };
    setToken(json.token);
    return json.token;
  })();
  try {
    return await inflightBootstrap;
  } finally {
    inflightBootstrap = null;
  }
}

export async function ensureToken(): Promise<string> {
  if (isPinkEmbed()) {
    const t = localStorage.getItem('accessToken');
    if (!t) {
      throw new Error('pink_not_logged_in');
    }
    return t;
  }
  const existing = getToken();
  if (existing) return existing;
  return bootstrapToken();
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

interface ApiOpts {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  isForm?: boolean;
  formData?: FormData;
}

function pinkApiRoot(): string {
  const raw = __PINK_API_BASE__ && __PINK_API_BASE__.replace(/\/$/, '');
  return String(raw || '').replace(/\/$/, '');
}

/** Map /api/... (test server paths) → Pink org routes. */
function resolveRequestUrl(path: string, query?: ApiOpts['query']): string {
  if (!isPinkEmbed()) {
    const url = new URL(path, window.location.origin);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  const base = pinkApiRoot();
  let orgPath: string;
  if (base) {
    orgPath = path.startsWith('/api') ? `${base}/org${path.slice('/api'.length)}` : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  } else {
    orgPath = path.startsWith('/api') ? `/api/v1/org${path.slice('/api'.length)}` : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  }
  const url = new URL(orgPath, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function api<T = unknown>(method: string, path: string, opts: ApiOpts = {}): Promise<T> {
  const token = await ensureToken();

  const url = resolveRequestUrl(path, opts.query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (isPinkEmbed()) {
    const tenant = localStorage.getItem('tenantContextId');
    if (tenant) {
      headers['X-Tenant-Id'] = tenant;
    }
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (res.status === 401) {
    if (!isPinkEmbed()) {
      clearToken();
    }
    throw new ApiError('unauthenticated', 401, json);
  }
  if (!res.ok) {
    const j = json as { error?: string; message?: string; detail?: unknown };
    throw new ApiError(j.error || j.message || `http_${res.status}`, res.status, json);
  }

  if (isPinkEmbed() && window.parent !== window) {
    const m = method.toUpperCase();
    if ((m === 'PUT' || m === 'POST') && /\/employees(\/|$)/.test(path)) {
      window.parent.postMessage({ type: 'pink:session-refresh', source: 'org-embed' }, window.location.origin);
    }
  }

  return json as T;
}
