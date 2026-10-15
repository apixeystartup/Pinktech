const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

const MAX_BINARY_BYTES = 5 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/gif",
]);

const NOISE_LINE_RE =
  /government|india|income.?tax|department|permanent|account.?number|permanent.?account|aadhaar|unique.?identification|authority|card|no\.|duplicate|issue|valid|digitally|signature|www\.|help|toll.?free|1947|1800/i;

const RELATION_RE = /\b(father|mother|husband|wife|guardian)\b/i;
const PREFIX_RE = /^(to|s o|d o|w o|c o)\s+/i;

function cleanText(raw) {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function findPan(lines) {
  const joined = lines.join("\n").toUpperCase();
  const match = joined.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
  return match ? match[0] : null;
}

function findAadhaar(lines) {
  // Prefer a clean standalone group ("1234 5678 9012" or 12 bare digits) on a
  // single line — never glue digit runs across lines (that merges pincodes).
  for (const line of lines) {
    let match = line.match(/\b(\d{4})\s(\d{4})\s(\d{4})\b/);
    if (match) {
      const digits = match[1] + match[2] + match[3];
      if (!/^(\d)\1{11}$/.test(digits)) return digits;
    }
    match = line.match(/(?<!\d)(\d{12})(?!\d)/);
    if (match && !/^(\d)\1{11}$/.test(match[1])) return match[1];
  }
  return null;
}

function toIsoDate(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime())) return null;
  return iso;
}

function findDob(lines) {
  for (const line of lines) {
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (also YYYY-MM-DD).
    let match = line.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
    if (match) {
      const iso = toIsoDate(match[1], match[2], match[3]);
      if (iso) return iso;
    }
    match = line.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const iso = toIsoDate(match[3], match[2], match[1]);
      if (iso) return iso;
    }
  }
  return null;
}

function findGender(lines) {
  const joined = lines.join(" ").toUpperCase();
  if (/\bFEMALE\b/.test(joined)) return "Female";
  if (/\bMALE\b/.test(joined)) return "Male";
  return null;
}

function findName(lines) {
  // Collect every plausible person-name line in document order, then prefer
  // the one above a relation marker ("Father's Name", "S/O", ...): on a PAN
  // card the holder's own name prints first, the father's second.
  const candidates = [];
  lines.forEach((line, index) => {
    if (/\d/.test(line)) return;
    let cleaned = line.replace(/[^a-zA-Z .']/g, " ").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(PREFIX_RE, "").trim();
    const words = cleaned.split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 6) return;
    if (cleaned.length < 3 || cleaned.length > 60) return;
    if (!/^[A-Z][a-zA-Z .']+$/.test(cleaned)) return;
    if (NOISE_LINE_RE.test(cleaned)) return;
    if (RELATION_RE.test(cleaned)) return;
    candidates.push({ index, cleaned });
  });
  if (!candidates.length) return null;
  const marker = lines.findIndex((line) => /father|mother|husband|guardian|s\/o|d\/o|w\/o|c\/o/i.test(line));
  let picked = candidates[0];
  if (marker > 0) {
    const above = candidates.filter((c) => c.index < marker);
    if (above.length) picked = above[above.length - 1];
  }
  const words = picked.cleaned.split(" ").filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function parseIdText(rawText) {
  const lines = cleanText(rawText);
  return {
    pan: findPan(lines),
    aadhaar: findAadhaar(lines),
    name: findName(lines),
    dob: findDob(lines),
    gender: findGender(lines),
  };
}

async function ocrImage(buffer) {
  // First run downloads the English traineddata (~15 MB) and caches it, so
  // this machine needs internet access at least once.
  const { data } = await Tesseract.recognize(buffer, "eng");
  return { text: data?.text || "", confidence: typeof data?.confidence === "number" ? Math.round(data.confidence) : null };
}

async function readPdfText(buffer) {
  const parsed = await pdfParse(buffer);
  return { text: parsed?.text || "", confidence: null };
}

/**
 * Extract doctor identity fields from an uploaded PAN / Aadhaar scan.
 * Images go through local OCR (tesseract); PDFs use their embedded text
 * layer. Returns parsed fields (null when not found) plus a confidence hint.
 */
async function extractIdentity({ buffer, mimeType }) {
  if (!buffer || !buffer.length) {
    const error = new Error("Empty file received");
    error.statusCode = 422;
    throw error;
  }
  if (buffer.length > MAX_BINARY_BYTES) {
    const error = new Error("File is too large for scanning (max 5 MB)");
    error.statusCode = 422;
    throw error;
  }

  const mime = String(mimeType || "").toLowerCase();
  let text;
  let confidence = null;
  let method;

  if (mime === "application/pdf" || mime === "pdf") {
    method = "pdf-text";
    ({ text } = await readPdfText(buffer));
    if (!text.trim()) {
      const error = new Error(
        "This PDF has no readable text (it looks like a photo scan). Upload a photo/image of the card instead.",
      );
      error.statusCode = 422;
      throw error;
    }
  } else if (IMAGE_MIMES.has(mime) || mime.startsWith("image/")) {
    method = "ocr";
    try {
      const result = await ocrImage(buffer);
      text = result.text;
      confidence = result.confidence;
    } catch (err) {
      const error = new Error(
        `Text recognition failed (${err?.message || "OCR engine error"}). Try a clearer photo.`,
      );
      error.statusCode = 422;
      throw error;
    }
    if (!text.trim()) {
      const error = new Error("No readable text found in this image. Try a clearer, well-lit photo.");
      error.statusCode = 422;
      throw error;
    }
  } else {
    const error = new Error("Unsupported file type. Upload an image (PNG/JPG) or a PDF.");
    error.statusCode = 422;
    throw error;
  }

  return { ...parseIdText(text), confidence, method };
}

module.exports = { extractIdentity, parseIdText, MAX_BINARY_BYTES };
