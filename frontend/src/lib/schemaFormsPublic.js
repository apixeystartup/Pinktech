const jsonHeaders = { "Content-Type": "application/json" };

export function getApiV1Base() {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api/v1";
}

function schemaFormsPrefix() {
  return `${getApiV1Base()}/forms/schema-forms`;
}

/** Turn stored relative PDF paths into an absolute URL (dev: frontend port vs API port). */
export function resolveSchemaFormAssetUrl(relativePath) {
  if (!relativePath) return "";
  if (relativePath.startsWith("http")) return relativePath;
  const origin = getApiV1Base().replace(/\/api\/v1\/?$/, "");
  return `${origin}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}

async function handleResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.error ||
      payload.message ||
      (Array.isArray(payload.errors) ? payload.errors.join(" ") : "Request failed.");
    const error = new Error(message);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function getPublicModule(id) {
  const response = await fetch(`${getApiV1Base()}/public/forms/schema-forms/modules/${id}`);
  return handleResponse(response);
}

/** Tokenized dispatch link (KYC sends to external users). */
export async function getPublicSchemaDispatch(token) {
  const response = await fetch(`${getApiV1Base()}/public/schema-dispatch/${encodeURIComponent(token)}`);
  return handleResponse(response);
}

export async function submitSchemaForm(payload) {
  const response = await fetch(`${getApiV1Base()}/public/forms/schema-forms/submissions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function waitForSchemaFormSubmission(identifier, onStatus) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    let status;
    try {
      const response = await fetch(
        `${getApiV1Base()}/public/forms/schema-forms/submissions/${encodeURIComponent(identifier)}/status`,
      );
      status = await handleResponse(response);
    } catch (error) {
      if (error.status && error.status !== 404 && error.status < 500) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      continue;
    }
    onStatus?.(status);
    if (status.pdfStatus === "completed" && status.pdfDownloadUrl) return status;
    if (status.pdfStatus === "failed") throw new Error(status.message || "Your PDF could not be prepared.");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error(
    "Your form may have been received, but PDF preparation is taking longer than expected. Please reopen this link before trying again.",
  );
}
