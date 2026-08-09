import api from "./api";

const BASE = "/schema-forms";

export async function getModules() {
  const { data } = await api.get(`${BASE}/modules`);
  return data;
}

export async function getModule(id) {
  const { data } = await api.get(`${BASE}/modules/${id}`);
  return data;
}

export async function createModule(payload) {
  const { data } = await api.post(`${BASE}/modules`, payload);
  return data;
}

export async function updateModule(id, payload) {
  const { data } = await api.put(`${BASE}/modules/${id}`, payload);
  return data;
}

export async function getFormResponses(moduleId) {
  const { data } = await api.get(`${BASE}/submissions/module/${moduleId}`);
  return data;
}

export async function seedClientForm() {
  const { data } = await api.post(`${BASE}/seed/client-form`);
  return data;
}
