const HTML_ALLOWED_FIELDS = new Set(["preAgreementText", "postAgreementText"]);

function sanitizeValue(value, allowHtml = false) {
  if (typeof value === "string") {
    return allowHtml ? value : value.replace(/[<>]/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, allowHtml));
  }

  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      sanitized[key] = sanitizeValue(nestedValue, HTML_ALLOWED_FIELDS.has(key));
    }
    return sanitized;
  }

  return value;
}

function sanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }

  if (req.query && typeof req.query === "object") {
    const cleanedQuery = sanitizeValue(req.query);
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, cleanedQuery);
  }

  return next();
}

module.exports = sanitizeMiddleware;
