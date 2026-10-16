import api from "./api";

export async function listSignTemplates() {
  const { data } = await api.get("/sign-templates");
  return data;
}

export async function createSignTemplate(name) {
  const { data } = await api.post("/sign-templates", { name });
  return data;
}

export async function updateSignTemplate(id, payload) {
  const { data } = await api.put(`/sign-templates/${id}`, payload);
  return data;
}

export async function deleteSignTemplate(id) {
  const { data } = await api.delete(`/sign-templates/${id}`);
  return data;
}

export async function uploadSignTemplateDocument(id, file, pages) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("pages", String(pages ?? 0));
  const { data } = await api.post(`/sign-templates/${id}/document`, fd);
  return data;
}

export async function fetchSignTemplateDocument(id) {
  const { data } = await api.get(`/sign-templates/${id}/document`, { responseType: "blob" });
  return data;
}

export async function sendFromTemplate(id, payload) {
  const { data } = await api.post(`/sign-templates/${id}/envelopes`, payload);
  return data;
}

export async function saveTenantProfilePartial(payload) {
  const { data } = await api.patch("/tenants/current", payload);
  return data;
}

export function signTemplateDocumentUrl(id) {
  return `${api.defaults?.baseURL || ""}/sign-templates/${id}/document`;
}
