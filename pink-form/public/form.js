const formEl = document.getElementById("dynamic-form");
const titleEl = document.getElementById("form-title");
const descriptionEl = document.getElementById("form-description");
const resultEl = document.getElementById("result");

function getModuleIdFromPath() {
  const parts = window.location.pathname.split("/");
  return parts[parts.length - 1];
}

function createField(field) {
  const wrapper = document.createElement("div");
  wrapper.className = field.ui?.width === "half" ? "" : "full";

  const label = document.createElement("label");
  label.htmlFor = field.key;
  label.textContent = field.label + (field.required ? " *" : "");
  wrapper.appendChild(label);

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
  } else if (field.type === "select") {
    input = document.createElement("select");
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Select...";
    input.appendChild(emptyOption);
    (field.options || []).forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt;
      optionEl.textContent = opt;
      input.appendChild(optionEl);
    });
  } else if (field.type === "radio") {
    input = document.createElement("div");
    (field.options || []).forEach((opt) => {
      const radioLabel = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = field.key;
      radio.value = opt;
      radioLabel.appendChild(radio);
      radioLabel.append(" " + opt);
      input.appendChild(radioLabel);
    });
  } else if (field.type === "checkbox") {
    input = document.createElement("div");
    (field.options || []).forEach((opt) => {
      const boxLabel = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.name = field.key;
      box.value = opt;
      boxLabel.appendChild(box);
      boxLabel.append(" " + opt);
      input.appendChild(boxLabel);
    });
  } else {
    input = document.createElement("input");
    if (field.type === "phone") input.type = "tel";
    else if (field.type === "file") input.type = "file";
    else input.type = field.type;
  }

  if (field.type !== "radio" && field.type !== "checkbox") {
    input.id = field.key;
    input.name = field.key;
    input.placeholder = field.placeholder || "";
    if (field.required) input.required = true;
    if (field.type === "file") {
      if (field.validations?.allowedFileTypes?.length) {
        input.accept = field.validations.allowedFileTypes.join(",");
      }
    }
  }

  wrapper.appendChild(input);

  const errorEl = document.createElement("div");
  errorEl.className = "error";
  errorEl.id = `error-${field.key}`;
  wrapper.appendChild(errorEl);

  return wrapper;
}

function collectFieldValue(field) {
  if (field.type === "radio") {
    const selected = document.querySelector(`input[name="${field.key}"]:checked`);
    return selected ? selected.value : "";
  }
  if (field.type === "checkbox") {
    const selected = [...document.querySelectorAll(`input[name="${field.key}"]:checked`)];
    return selected.map((item) => item.value);
  }
  if (field.type === "file") {
    const input = document.getElementById(field.key);
    const file = input?.files?.[0];
    if (!file) return "";
    // MVP: submit metadata now; binary upload API can be added with S3 next.
    return {
      name: file.name,
      size: file.size,
      type: file.type
    };
  }
  const input = document.getElementById(field.key);
  return input ? input.value : "";
}

function clearErrors(fields) {
  fields.forEach((field) => {
    const el = document.getElementById(`error-${field.key}`);
    if (el) el.textContent = "";
  });
}

async function init() {
  const moduleId = getModuleIdFromPath();
  const response = await fetch(`/api/modules/${moduleId}`);
  if (!response.ok) {
    titleEl.textContent = "Form not found";
    formEl.innerHTML = "";
    return;
  }
  const moduleDoc = await response.json();
  const fields = moduleDoc.schema?.fields || [];
  const settings = moduleDoc.schema?.settings || {};

  titleEl.textContent = moduleDoc.name;
  descriptionEl.textContent = settings.description || "";
  formEl.innerHTML = "";
  fields.forEach((field) => formEl.appendChild(createField(field)));

  const honeypot = document.createElement("input");
  honeypot.type = "text";
  honeypot.name = "website";
  honeypot.style.display = "none";
  formEl.appendChild(honeypot);

  const submitBtn = document.createElement("button");
  submitBtn.textContent = settings.submitLabel || "Submit";
  submitBtn.className = "full";
  formEl.appendChild(submitBtn);

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(fields);
    resultEl.innerHTML = "";

    const data = {};
    fields.forEach((field) => {
      data[field.key] = collectFieldValue(field);
    });

    const submitResponse = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleId,
        data,
        website: honeypot.value
      })
    });

    const payload = await submitResponse.json();
    if (!submitResponse.ok) {
      if (payload.fieldErrors) {
        Object.entries(payload.fieldErrors).forEach(([key, message]) => {
          const errorEl = document.getElementById(`error-${key}`);
          if (errorEl) errorEl.textContent = message;
        });
      } else {
        resultEl.innerHTML = `<div class="error">${payload.error || "Failed to submit."}</div>`;
      }
      return;
    }

    formEl.reset();
    resultEl.innerHTML = `<div class="success">${payload.message || settings.successMessage || "Submitted successfully."}</div>`;
  });
}

init().catch(() => {
  titleEl.textContent = "Failed to load form.";
});
