function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function sanitizeString(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim();
}

function validateAgainstSchema(fields, submissionData) {
  const errors = {};
  const normalized = {};

  for (const field of fields) {
    const rawValue = submissionData[field.key];
    const isEmpty =
      rawValue === undefined ||
      rawValue === null ||
      rawValue === "" ||
      (Array.isArray(rawValue) && rawValue.length === 0);

    if (field.required && isEmpty) {
      errors[field.key] = "This field is required.";
      continue;
    }

    if (isEmpty) {
      normalized[field.key] = field.type === "checkbox" ? [] : "";
      continue;
    }

    if (field.type === "checkbox") {
      const values = asArray(rawValue).map((v) => sanitizeString(v));
      if (Array.isArray(field.options) && values.some((v) => !field.options.includes(v))) {
        errors[field.key] = "Invalid checkbox option selected.";
        continue;
      }
      normalized[field.key] = values;
      continue;
    }

    if (field.type === "file") {
      if (typeof rawValue !== "object" || rawValue === null) {
        errors[field.key] = "Invalid file payload.";
        continue;
      }
      const fileName = sanitizeString(rawValue.name);
      const fileType = sanitizeString(rawValue.type);
      const fileSize = Number(rawValue.size);

      if (!fileName || Number.isNaN(fileSize) || fileSize < 0) {
        errors[field.key] = "Invalid file details.";
        continue;
      }

      const allowed = field.validations?.allowedFileTypes;
      if (Array.isArray(allowed) && allowed.length) {
        const isAllowed = allowed.some((allowedType) => {
          if (allowedType.endsWith("/*")) {
            const prefix = allowedType.slice(0, -1);
            return fileType.startsWith(prefix);
          }
          return fileType === allowedType;
        });
        if (!isAllowed) {
          errors[field.key] = "File type is not allowed.";
          continue;
        }
      }

      normalized[field.key] = { name: fileName, type: fileType, size: fileSize };
      continue;
    }

    if (field.type === "number") {
      const num = Number(rawValue);
      if (Number.isNaN(num)) {
        errors[field.key] = "Must be a valid number.";
        continue;
      }
      if (field.validations?.min !== undefined && num < field.validations.min) {
        errors[field.key] = `Must be greater than or equal to ${field.validations.min}.`;
        continue;
      }
      if (field.validations?.max !== undefined && num > field.validations.max) {
        errors[field.key] = `Must be less than or equal to ${field.validations.max}.`;
        continue;
      }
      normalized[field.key] = num;
      continue;
    }

    const value = sanitizeString(rawValue);
    if (field.validations?.minLength && value.length < field.validations.minLength) {
      errors[field.key] = `Minimum length is ${field.validations.minLength}.`;
      continue;
    }
    if (field.validations?.maxLength && value.length > field.validations.maxLength) {
      errors[field.key] = `Maximum length is ${field.validations.maxLength}.`;
      continue;
    }
    if (field.validations?.pattern) {
      const regex = new RegExp(field.validations.pattern);
      if (!regex.test(value)) {
        errors[field.key] = "Invalid format.";
        continue;
      }
    }

    if (field.type === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors[field.key] = "Invalid email.";
        continue;
      }
    }

    if (field.type === "select" || field.type === "radio") {
      if (Array.isArray(field.options) && !field.options.includes(value)) {
        errors[field.key] = "Invalid option selected.";
        continue;
      }
    }

    normalized[field.key] = value;
  }

  return { errors, normalized };
}

module.exports = { validateAgainstSchema };
