const moduleSelect = document.getElementById("module-select");
const schemaJson = document.getElementById("schema-json");
const statusEl = document.getElementById("status");
const publicUrlEl = document.getElementById("public-url");
const saveBtn = document.getElementById("save-btn");
const seedBtn = document.getElementById("seed-btn");

let modules = [];

const starterSchema = {
  name: "New Form",
  moduleType: "FORM",
  isPublished: true,
  schema: {
    settings: {
      submitLabel: "Submit",
      successMessage: "Thanks. Your response has been received.",
      allowDraft: false
    },
    fields: [
      { key: "fullName", label: "Full Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true }
    ]
  }
};

function showStatus(message, isError = false) {
  statusEl.className = isError ? "error" : "success";
  statusEl.textContent = message;
}

function updatePublicUrl(moduleId) {
  if (!moduleId) {
    publicUrlEl.textContent = "-";
    publicUrlEl.href = "#";
    return;
  }
  const url = `${window.location.origin}/forms/${moduleId}`;
  publicUrlEl.textContent = url;
  publicUrlEl.href = url;
}

function populateSelect() {
  moduleSelect.innerHTML = "";
  const createOption = document.createElement("option");
  createOption.value = "";
  createOption.textContent = "Create new form";
  moduleSelect.appendChild(createOption);

  modules.forEach((mod) => {
    const option = document.createElement("option");
    option.value = mod._id;
    option.textContent = mod.name;
    moduleSelect.appendChild(option);
  });
}

function loadSelectedModule() {
  const selectedId = moduleSelect.value;
  if (!selectedId) {
    schemaJson.value = JSON.stringify(starterSchema, null, 2);
    updatePublicUrl("");
    return;
  }
  const selected = modules.find((mod) => mod._id === selectedId);
  if (!selected) {
    schemaJson.value = JSON.stringify(starterSchema, null, 2);
    updatePublicUrl("");
    return;
  }
  schemaJson.value = JSON.stringify(selected, null, 2);
  updatePublicUrl(selectedId);
}

async function refreshModules() {
  const response = await fetch("/api/modules");
  modules = await response.json();
  populateSelect();
  loadSelectedModule();
}

saveBtn.addEventListener("click", async () => {
  try {
    const payload = JSON.parse(schemaJson.value);
    const isUpdate = Boolean(payload._id);
    const url = isUpdate ? `/api/modules/${payload._id}` : "/api/modules";
    const method = isUpdate ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      showStatus(result.errors?.join(" ") || result.error || "Failed to save form.", true);
      return;
    }

    showStatus("Form saved successfully.");
    await refreshModules();
    moduleSelect.value = result._id;
    loadSelectedModule();
  } catch (error) {
    showStatus("Invalid JSON payload.", true);
  }
});

seedBtn.addEventListener("click", async () => {
  const response = await fetch("/api/seed/client-form", { method: "POST" });
  const result = await response.json();
  if (!response.ok) {
    showStatus(result.error || "Failed to seed form.", true);
    return;
  }
  showStatus(result.message || "Seed completed.");
  await refreshModules();
  if (result.moduleId) {
    moduleSelect.value = result.moduleId;
    loadSelectedModule();
  }
});

moduleSelect.addEventListener("change", loadSelectedModule);

refreshModules().catch(() => {
  showStatus("Failed to load modules.", true);
});
