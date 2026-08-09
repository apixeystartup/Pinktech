const jsonHeaders = { "Content-Type": "application/json" };

export function getApiV1Base() {
  return import.meta.env.VITE_API_BASE_URL || "/api/v1";
}

function schemaFormsPrefix() {
  return `${getApiV1Base()}/schema-forms`;
}

/** Turn stored relative PDF paths into an absolute URL. */
export function resolveSchemaFormAssetUrl(relativePath) {
  if (!relativePath) return "";
  if (relativePath.startsWith("http")) return relativePath;
  const base = getApiV1Base();
  const origin = base.startsWith("http") ? base.replace(/\/api\/v1\/?$/, "") : window.location.origin;
  return `${origin}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}

async function handleResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.error ||
      (Array.isArray(payload.errors) ? payload.errors.join(" ") : "Request failed.");
    const error = new Error(message);
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function getPublicModule(id) {
  const response = await fetch(`${schemaFormsPrefix()}/modules/${id}`);
  return handleResponse(response);
}

/** Tokenized dispatch link (KYC sends to external users). */
export async function getPublicSchemaDispatch(token) {
  const response = await fetch(`${getApiV1Base()}/public/schema-dispatch/${encodeURIComponent(token)}`);
  return handleResponse(response);
}

export async function submitSchemaForm(payload) {
  const response = await fetch(`${schemaFormsPrefix()}/submissions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
