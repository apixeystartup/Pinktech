function sanitizeValue(value) {
  if (typeof value === "string") {
    return value.replace(/[<>]/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      // Drop potentially dangerous mongo-style keys.
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      sanitized[key] = sanitizeValue(nestedValue);
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
