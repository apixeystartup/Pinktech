function validateModulePayload(payload) {
  const errors = [];
  const allowedTypes = new Set([
    "text",
    "email",
    "phone",
    "number",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "date",
    "file"
  ]);

  if (!payload || typeof payload !== "object") {
    return ["Payload must be an object."];
  }

  if (!payload.name || typeof payload.name !== "string") {
    errors.push("name is required.");
  }

  if (payload.moduleType !== "FORM") {
    errors.push("moduleType must be FORM for this endpoint.");
  }

  const fields = payload.schema?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    errors.push("schema.fields must be a non-empty array.");
    return errors;
  }

  const keys = new Set();
  for (const field of fields) {
    if (!field.key || typeof field.key !== "string") {
      errors.push("Each field.key is required.");
    } else if (keys.has(field.key)) {
      errors.push(`Duplicate field key: ${field.key}`);
    } else {
      keys.add(field.key);
    }

    if (!field.label || typeof field.label !== "string") {
      errors.push(`field.label is required for ${field.key || "unknown key"}`);
    }

    if (!allowedTypes.has(field.type)) {
      errors.push(`Unsupported field type for ${field.key || "unknown key"}`);
    }

    if (
      (field.type === "select" || field.type === "radio") &&
      (!Array.isArray(field.options) || field.options.length === 0)
    ) {
      errors.push(`field.options required for ${field.key}`);
    }
  }

  return errors;
}

module.exports = { validateModulePayload };
