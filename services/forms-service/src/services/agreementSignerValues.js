const ApiError = require("@pink/shared").ApiError;

function agreementSignerValues(snapshot, postedValues, signatureDataUrl, side) {
  if (!snapshot) return {};
  if (
    typeof signatureDataUrl !== "string" ||
    signatureDataUrl.length > 4 * 1024 * 1024 ||
    !/^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(signatureDataUrl)
  ) {
    throw new ApiError(422, `A valid ${side} agreement signature is required.`);
  }
  const values = postedValues && typeof postedValues === "object" && !Array.isArray(postedValues)
    ? postedValues
    : {};
  const editableFields = new Map(
    (snapshot.fields || [])
      .filter((field) => {
        const tag = String(field.tag || "").toLowerCase();
        return tag.startsWith("custom.") && ["TEXT", "DATE", "CHECKBOX"].includes(String(field.type || "").toUpperCase());
      })
      .map((field) => [String(field._id || field.id), field]),
  );
  const normalized = {};
  for (const [fieldId, rawValue] of Object.entries(values)) {
    const field = editableFields.get(fieldId);
    if (!field) throw new ApiError(422, `Invalid ${side} agreement field.`);
    if (rawValue != null && !["string", "number", "boolean"].includes(typeof rawValue)) {
      throw new ApiError(422, `Invalid ${side} agreement field value.`);
    }
    const value = String(rawValue ?? "").trim();
    if (value.length > 4000) throw new ApiError(422, `The ${side} agreement field is too long.`);
    normalized[fieldId] = value;
  }

  for (const field of snapshot.fields || []) {
    const type = String(field.type || "").toUpperCase();
    const tag = String(field.tag || "").toLowerCase();
    if (!tag.startsWith("custom.") && field.required === false) continue;
    if (["SIGNATURE", "INITIALS"].includes(type)) continue;
    if (tag.startsWith("custom.") && !String(normalized[String(field._id || field.id)] || "").trim()) {
      throw new ApiError(422, `Complete the required ${side} agreement field "${field.label || field.tag}".`);
    }
    if (!tag.startsWith("custom.") && !String(field.value || "").trim()) {
      throw new ApiError(422, `The ${side} agreement is missing "${field.label || field.tag}". Please ask an administrator to fix the template.`);
    }
  }
  return normalized;
}

module.exports = { agreementSignerValues };
