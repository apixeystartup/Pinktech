/**
 * Party auto-detect for uploaded agreement docs.
 *
 * Agreements use different words for the same two sides (buyer/seller,
 * tenant/doctor, party 1/party 2, clinic/physician, ...). The template stored
 * in the form builder always uses canonical tags ({{tenant.*}} / {{doctor.*}}).
 * These helpers bridge the gap: after a .docx/.txt upload we scan the raw
 * text for literal party mentions, the tenant picks which mention is the
 * tenant side vs the doctor side, and every occurrence is replaced with the
 * chosen placeholder before the template is saved.
 *
 * No dependencies — safe to mirror in the browser (see
 * frontend/src/lib/partyExtract.js, which must stay in sync).
 */

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
  // A role capture can swallow the next "Seller: ..." label when the doc has
  // no line break between them ("Buyer: ACME Seller: Dr. X") — cut there.
  s = s
    .split(
      /\b(buyer|seller|tenant|doctor|physician|clinic|hospital|employer|licensor|licensee|first party|second party|party\s*[12ab])\s*[:\-–—]/i,
    )[0]
    .trim();
  // A role capture can also swallow the next sentence ("Seller: Dr. X. Address
  // of doctor: ...") — cut at the next field label or sentence keyword.
  s = s
    .split(/\b(address|phone|email|registration|qualification|specialization|between|agreement)\b\s*(of\b|:)?/i)[0]
    .trim();
  // Doctor-name regex can swallow the next sentence word ("Dr. Jane Buyer"
  // when "Buyer:" follows) — drop a trailing role word.
  s = s.replace(/\s+(buyer|seller|tenant|doctor|party|parties)$/i, "").trim();
  // Trim trailing role words left over from "X, hereinafter the Seller" etc.
  s = s.replace(/[,;\s]+(hereinafter|hereafter|referred to as).*/i, "").trim();
  s = s.replace(/^[:\-–—\s]+|[:\-–—\s.,;]+$/g, "").trim();
  return s;
}

function isValidCandidate(s) {
  if (!s || s.length < 2 || s.length > 120) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (STOP_VALUES.has(s.toLowerCase())) return false;
  // Skip pure placeholders and signature markers.
  if (/{{.*}}/.test(s)) return false;
  if (/^signature\./i.test(s)) return false;
  return true;
}

/** Guess which side a literal mention belongs to. */
function partyRoleGuess(value, tenantName = "") {
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
  // Person-like (2-4 capitalized words) leans doctor; org-like leans tenant.
  if (/^([A-Z][a-zA-Z.'-]+\s+){1,3}[A-Z][a-zA-Z.'-]+$/.test(v) && v.split(" ").length <= 4) {
    return "doctor";
  }
  return "unknown";
}

/**
 * Scan agreement text/HTML for literal party mentions.
 * Returns [{ value, hint, guess }] in first-seen order, max 10.
 */
function detectParties(htmlOrText, { tenantName = "" } = {}) {
  const text = stripHtml(htmlOrText).replace(/[ \t]+/g, " ");
  const seen = new Map(); // lowercased value -> entry

  const push = (raw, hint) => {
    const value = cleanCandidate(raw);
    if (!isValidCandidate(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.set(key, { value, hint, guess: partyRoleGuess(value, tenantName) });
  };

  // 1. "between X and Y" — the classic agreement opener. Match to end of
  // line (not the first dot) so "Dr. Jane Smith." stays whole; the trailing
  // period is trimmed by cleanCandidate.
  const betweenRe = /\bbetween\s+([^,;\n]+?)\s+and\s+([^,;\n]+?)(?=[,;\n]|$)/gi;
  let m;
  while ((m = betweenRe.exec(text)) !== null) {
    push(m[1], "Found in “between … and …”");
    push(m[2], "Found in “between … and …”");
    if (seen.size >= 10) break;
  }

  // 2. Labeled role lines: "Buyer: ACME", "Party 1 - John", "Seller – XYZ".
  const roleRe =
    /(buyer|seller|tenant|doctor|physician|clinic|hospital|employer|licensor|licensee|first party|second party|party\s*[12ab])\s*[:\-–—]\s*([^\n,;]{2,120})/gi;
  while ((m = roleRe.exec(text)) !== null) {
    push(m[2], `Found after “${m[1]}”`);
    if (seen.size >= 10) break;
  }

  // 3. Doctor-style names: "Dr. Jane Smith".
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

/**
 * Replace every occurrence of each literal party mention with its placeholder.
 * `replacements`: [{ match, replaceWith }] e.g. { match: "ACME Corp", replaceWith: "{{tenant.name}}" }.
 * Longest matches first so "ACME Corp Ltd" wins over "ACME Corp".
 */
function replacePartyMentions(html, replacements) {
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

module.exports = {
  stripHtml,
  detectParties,
  partyRoleGuess,
  replacePartyMentions,
};
