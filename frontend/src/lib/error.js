export function getErrorMessage(error) {
  const data = error?.response?.data;
  if (data?.message) {
    // Joi validation errors carry per-field details — surface them so the
    // user knows which field to fix instead of a bare "Validation failed".
    const fieldMsgs = Array.isArray(data.details)
      ? data.details
          .map((d) => {
            const label = Array.isArray(d?.context?.key) ? d.context.key.join(".") : d?.context?.key;
            return label ? `${label}: ${d.message}` : d?.message;
          })
          .filter(Boolean)
      : [];
    return fieldMsgs.length ? `${data.message} — ${fieldMsgs.join("; ")}` : data.message;
  }
  if (error?.message) {
    return error.message;
  }
  return "Something went wrong.";
}
