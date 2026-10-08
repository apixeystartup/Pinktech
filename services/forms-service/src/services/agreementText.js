const FALLBACKS = {
  pre: "I agree not to disclose any data shared during this process.",
  post:
    "I confirm submitted information is accurate and I will not disclose sensitive form data."
};

const SETTING_KEYS = {
  pre: "preAgreementText",
  post: "postAgreementText"
};

/**
 * The agreement that gets signed and stamped into the PDF must be the text the
 * module owner authored, not the copy echoed back by the browser. The request
 * body passes through sanitizeMiddleware, which strips angle brackets from
 * every field named `text`, so trusting the client round-trip would store
 * markup such as `h1Title/h1` instead of real headings.
 */
function resolveAgreementText(moduleDoc, phase) {
  const settingKey = SETTING_KEYS[phase];
  const stored = settingKey ? moduleDoc?.formSchema?.settings?.[settingKey] : "";
  if (typeof stored === "string" && stored.trim()) {
    return stored;
  }
  return FALLBACKS[phase] || "";
}

function resolveAgreementTexts(moduleDoc) {
  return {
    pre: resolveAgreementText(moduleDoc, "pre"),
    post: resolveAgreementText(moduleDoc, "post")
  };
}

module.exports = { resolveAgreementText, resolveAgreementTexts, FALLBACKS };