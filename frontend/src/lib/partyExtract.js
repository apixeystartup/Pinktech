// Browser mirror of shared/src/partyExtract.js — keep the two in sync.
// Detects literal party mentions in an uploaded agreement so the tenant can
// map each one to {{tenant.*}} / {{doctor.*}} before saving the template.

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

const STOP_VALUES = new Set(
  [
    "agreement", "contract", "form", "document", "terms", "conditions",
    "buyer", "seller", "tenant", "doctor", "party", "parties",
    "first party", "second party", "organisation", "organization",
  ].map((s) => s.toLowerCase()),
);

function cleanCandidate(raw) {
  let s = String(raw || "")
    .replace(/[*"'\u201c\u201d]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s
    .split(
      /\b(buyer|seller|tenant|doctor|physician|clinic|hospital|employer|licensor|licensee|first party|second party|party\s*[12ab])\s*[:\-–—]/i,
    )[0]
    .trim();
  s = s
    .split(/\b(address|phone|email|registration|qualification|specialization|between|agreement)\b\s*(of\b|:)?/i)[0]
    .trim();
  s = s.replace(/\s+(buyer|seller|tenant|doctor|party|parties)$/i, "").trim();
  s = s.replace(/[,;\s]+(hereinafter|hereafter|referred to as).*/i, "").trim();
  s = s.replace(/^[:\-–—\s]+|[:\-–—\s.,;]+$/g, "").trim();
  return s;
}

function isValidCandidate(s) {
  if (!s || s.length < 2 || s.length > 120) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (STOP_VALUES.has(s.toLowerCase())) return false;
  if (/{{.*}}/.test(s)) return false;
  if (/^signature\./i.test(s)) return false;
  return true;
}

export function partyRoleGuess(value, tenantName = "") {
  const v = String(value || "").trim();
  const low = v.toLowerCase();
  const tenantLow = String(tenantName || "").trim().toLowerCase();
  if (tenantLow && (low === tenantLow || (tenantLow.length > 3 && low.includes(tenantLow)))) {
    return "tenant";
  }
  if (/^dr\.?\s/i.test(v)) return "doctor";
  if (/\b(doctor|physician|surgeon|specialist|mbbs|md\b|ms\b|consultant)\b/i.test(v)) return "doctor";
  if (/\b(pvt|ltd|limited|inc|corp|hospital|clinic|centre|center|labs?|pharma|health|healthcare|medical|trust|foundation)\b/i.test(v)) {
    return "tenant";
  }
  if (/^([A-Z][a-zA-Z.'-]+\s+){1,3}[A-Z][a-zA-Z.'-]+$/.test(v) && v.split(" ").length <= 4) {
    return "doctor";
  }
  return "unknown";
}

export function detectParties(htmlOrText, { tenantName = "" } = {}) {
  const text = stripHtml(htmlOrText).replace(/[ \t]+/g, " ");
  const seen = new Map();

  const push = (raw, hint) => {
    const value = cleanCandidate(raw);
    if (!isValidCandidate(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.set(key, { value, hint, guess: partyRoleGuess(value, tenantName) });
  };

  const betweenRe = /\bbetween\s+([^,;\n]+?)\s+and\s+([^,;\n]+?)(?=[,;\n]|$)/gi;
  let m;
  while ((m = betweenRe.exec(text)) !== null) {
    push(m[1], "Found in “between … and …”");
    push(m[2], "Found in “between … and …”");
    if (seen.size >= 10) break;
  }

  const roleRe =
    /(buyer|seller|tenant|doctor|physician|clinic|hospital|employer|licensor|licensee|first party|second party|party\s*[12ab])\s*[:\-–—]\s*([^\n,;]{2,120})/gi;
  while ((m = roleRe.exec(text)) !== null) {
    push(m[2], `Found after “${m[1]}”`);
    if (seen.size >= 10) break;
  }

  const drRe = /\bDr\.?\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}/g;
  while ((m = drRe.exec(text)) !== null) {
    push(m[0], "Doctor-style name");
    if (seen.size >= 10) break;
  }

  return [...seen.values()].slice(0, 10);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replacePartyMentions(html, replacements) {
  let out = String(html ?? "");
  const rows = (Array.isArray(replacements) ? replacements : [])
    .filter((r) => r && r.match && r.replaceWith)
    .slice()
    .sort((a, b) => String(b.match).length - String(a.match).length);
  for (const { match, replaceWith } of rows) {
    const re = new RegExp(escapeRegExp(String(match).trim()), "g");
    out = out.replace(re, String(replaceWith));
  }
  return out;
}

export const PARTY_PLACEHOLDER_OPTIONS = [
  { value: "", label: "Ignore — keep as-is" },
  { value: "{{tenant.name}}", label: "Tenant → Organization name" },
  { value: "{{tenant.address}}", label: "Tenant → Organization address" },
  { value: "{{tenant.email}}", label: "Tenant → Organization email" },
  { value: "{{tenant.phone}}", label: "Tenant → Organization phone" },
  { value: "{{tenant.registration_number}}", label: "Tenant → Registration no." },
  { value: "{{doctor.name}}", label: "Doctor → Doctor name" },
  { value: "{{doctor.registration_number}}", label: "Doctor → Registration no." },
  { value: "{{doctor.address}}", label: "Doctor → Address" },
  { value: "{{doctor.phone}}", label: "Doctor → Phone" },
  { value: "{{doctor.email}}", label: "Doctor → Email" },
];
