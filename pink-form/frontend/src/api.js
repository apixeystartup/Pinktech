const jsonHeaders = { "Content-Type": "application/json" };

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

export async function getModules() {
  const response = await fetch("/api/modules");
  return handleResponse(response);
}

export async function getModule(id) {
  const response = await fetch(`/api/modules/${id}`);
  return handleResponse(response);
}

export async function createModule(payload) {
  const response = await fetch("/api/modules", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
}

export async function updateModule(id, payload) {
  const response = await fetch(`/api/modules/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
}

export async function submitForm(payload) {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
}

export async function getFormResponses(moduleId) {
  const response = await fetch(`/api/submissions/module/${moduleId}`);
  return handleResponse(response);
}

export async function seedClientForm() {
  const response = await fetch("/api/seed/client-form", { method: "POST" });
  return handleResponse(response);
}
