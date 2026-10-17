const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// puppeteer is ESM-only, so it is required lazily inside generateSubmissionPdf.
// That keeps the pure HTML builders above importable from CommonJS tests.

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Mirrors frontend/src/lib/agreementFormatter.js ALLOWED_TAGS so the PDF looks
// exactly like the Opening Agreement card in the form.
const AGREEMENT_ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "br", "hr", "blockquote", "img"
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

// Only embedded raster data URLs survive as <img src> — the saved Party 1
// signature. Remote URLs and SVG are dropped.
const SAFE_IMG_SRC_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function sanitizeAgreementHtml(input) {
  // Pull safe embedded images (Party 1's saved signature) out first and
  // re-insert them after the tag pass, which rebuilds tags without attributes.
  const images = [];
  const tokenized = String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/<(img)(\s[^>]*)?>/gi, (match, _tag, attrs) => {
      const srcMatch = String(attrs || "").match(/\bsrc\s*=\s*"([^"]*)"/i);
      const src = srcMatch ? srcMatch[1] : "";
      if (!SAFE_IMG_SRC_RE.test(src)) return "";
      images.push(src);
      return `@@AGREEMENT_IMG_${images.length - 1}@@`;
    });
  const stripped = tokenized.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, rawTag) => {
    const tag = String(rawTag).toLowerCase();
    if (!AGREEMENT_ALLOWED_TAGS.has(tag)) return "";
    const isClosing = /^<\s*\//.test(match);
    if (VOID_TAGS.has(tag)) return isClosing ? "" : `<${tag} />`;
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });
  return stripped.replace(/@@AGREEMENT_IMG_(\d+)@@/g, (_m, i) => {
    const src = images[Number(i)] || "";
    if (!SAFE_IMG_SRC_RE.test(src)) return "";
    return `<img src="${escapeHtml(src)}" alt="Signature" />`;
  });
}

function applyInlineMarkup(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function structuredHtmlFromText(rawText) {
  const html = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${applyInlineMarkup(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      const tag = listType || "ul";
      html.push(`<${tag}>${listItems.map((item) => `<li>${applyInlineMarkup(item)}</li>`).join("")}</${tag}>`);
      listItems = [];
      listType = null;
    }
  };

  for (const rawLine of String(rawText).split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = line.match(/^#+/)[0].length;
      html.push(`<h${level}>${applyInlineMarkup(heading[1])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      html.push("<hr/>");
      continue;
    }

    const bullet = line.match(/^[-*\u2022]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return html.join("");
}

/**
 * Agreement snapshots are authored as HTML, but legacy/plain-text snapshots are
 * stored unformatted. Render both to the same markup so the packet never shows
 * raw tag names or a wall of unstyled text.
 */
function renderAgreementHtml(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return '<p class="muted">No agreement text recorded.</p>';
  if (/<\s*\/?\s*[a-z][a-z0-9]*\b[^>]*>/i.test(raw)) {
    return sanitizeAgreementHtml(raw);
  }
  return sanitizeAgreementHtml(structuredHtmlFromText(raw));
}

function toDisplayValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function toDisplayLabel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SIG_MARKER_RES = /{{\s*signature\.opening\s*}}/i;

function signatureImageHtml(dataUrl, label) {
  if (!dataUrl) return '<div class="muted">No signature provided</div>';
  const safe = String(dataUrl).replace(/"/g, "&quot;");
  return `<img class="signature" src="${safe}" alt="${escapeHtml(label)}" />`;
}

/**
 * The signature-position marker ({{signature.opening}}) lets the signature
 * image render exactly
 * there. Without a marker the image renders below the agreement as before.
 */
function renderAgreementSection({ title, text, accepted, acceptedAt, signatureDataUrl, markerRe, signatureLabel }) {
  const raw = String(text ?? "");
  const match = raw.match(markerRe || SIG_MARKER_RES);
  let bodyHtml;
  let trailingSigHtml = signatureImageHtml(signatureDataUrl, signatureLabel);
  if (match && match.index !== undefined) {
    bodyHtml =
      renderAgreementHtml(raw.slice(0, match.index)) +
      signatureImageHtml(signatureDataUrl, signatureLabel) +
      renderAgreementHtml(raw.slice(match.index + match[0].length));
    trailingSigHtml = "";
  } else {
    bodyHtml = renderAgreementHtml(raw);
  }
  return `<div class="section agreementBox">
      <h2>${title}</h2>
      <div class="agreementBody">${bodyHtml}</div>
      <div class="agreementMeta">Accepted: ${accepted ? "Yes" : "No"}</div>
      <div class="agreementMeta">Accepted At: ${escapeHtml(acceptedAt || "-")}</div>
      ${trailingSigHtml}
    </div>`;
}

function buildSubmissionPdfHtml({ moduleName, submissionData, agreements, includeAgreements = true }) {
  const entries = Object.entries(submissionData || {});
  const responseCards = entries
    .map(([key, value]) => {
      const displayValue = toDisplayValue(value).trim();
      return `<article class="responseCard">
        <div class="responseLabel">${escapeHtml(toDisplayLabel(key))}</div>
        <div class="responseValue">${escapeHtml(displayValue || "No response")}</div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Submission PDF</title>
    <style>
      body { font-family: Arial, sans-serif; color: #222; padding: 20px; }
      h1, h2 { color: #b01257; margin-bottom: 8px; }
      .section { margin-bottom: 24px; }
      .responseSection { margin: 26px 0; }
      .responseHeader { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #f4d5e3; }
      .responseHeader h2 { margin: 0 0 4px; }
      .responseIntro { margin: 0; color: #687386; font-size: 12px; }
      .responseCount { flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; background: #fdf0f7; color: #9c255c; font-size: 11px; font-weight: 700; }
      .responseGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .responseCard { min-width: 0; padding: 12px 13px; border: 1px solid #e7eaf0; border-left: 3px solid #d8588c; border-radius: 7px; background: #fbfcfe; break-inside: avoid; page-break-inside: avoid; }
      .responseLabel { margin-bottom: 6px; color: #647087; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
      .responseValue { color: #202b3c; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
      .responseEmpty { padding: 18px; border: 1px dashed #d7dce5; border-radius: 7px; color: #687386; text-align: center; }
      .signature { max-width: 280px; border: 1px solid #ddd; padding: 6px; border-radius: 6px; background: #fff; }
      .small { font-size: 12px; color: #666; }
      .agreementBox { border: 1px solid #eee; border-radius: 8px; padding: 12px; background: #fafafa; }
      .agreementMeta { font-size: 12px; color: #666; margin: 8px 0; }
      .muted { color: #888; font-style: italic; }
      .agreementBody { font-size: 14px; line-height: 1.55; color: #222; }
      .agreementBody h1, .agreementBody h2, .agreementBody h3, .agreementBody h4 { margin: 14px 0 6px; line-height: 1.25; color: #111; }
      .agreementBody h1 { font-size: 20px; }
      .agreementBody h2 { font-size: 17px; }
      .agreementBody h3 { font-size: 15px; }
      .agreementBody h4 { font-size: 14px; }
      .agreementBody h1:first-child, .agreementBody h2:first-child { margin-top: 0; }
      .agreementBody p { margin: 0 0 8px; }
      .agreementBody ul, .agreementBody ol { margin: 0 0 10px; padding-left: 22px; }
      .agreementBody li { margin: 3px 0; }
      .agreementBody hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
      .agreementBody blockquote { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid #eee; color: #555; }
      @media print { .responseSection { break-inside: auto; } .responseHeader { break-after: avoid; page-break-after: avoid; } }
    </style>
  </head>
  <body>
    <h1>Form Submission Packet</h1>
    <div class="small">Generated at: ${new Date().toISOString()}</div>
    <div class="section">
      <h2>Form</h2>
      <div>${escapeHtml(moduleName)}</div>
    </div>

    ${includeAgreements ? renderAgreementSection({
      title: "Opening Agreement",
      text: agreements.pre?.text,
      accepted: agreements.pre?.accepted,
      acceptedAt: agreements.pre?.acceptedAt,
      signatureDataUrl: agreements.pre?.signatureDataUrl,
      markerRe: SIG_MARKER_RES,
      signatureLabel: "Opening signature",
    }) : ""}

    <section class="responseSection">
      <div class="responseHeader">
        <div>
          <h2>Submitted Form Data</h2>
          <p class="responseIntro">Responses recorded with this submission</p>
        </div>
        <span class="responseCount">${entries.length} ${entries.length === 1 ? "response" : "responses"}</span>
      </div>
      ${entries.length
        ? `<div class="responseGrid">${responseCards}</div>`
        : '<div class="responseEmpty">No form responses were submitted.</div>'}
    </section>

  </body>
</html>`;
}

async function generateSubmissionPdf({ submissionId, moduleName, submissionData, agreements, includeAgreements = true }) {
  const storageDir = path.join(process.cwd(), "storage", "pdfs");
  fs.mkdirSync(storageDir, { recursive: true });

  const fileName = `submission-${submissionId}.pdf`;
  const filePath = path.join(storageDir, fileName);
  const html = buildSubmissionPdfHtml({ moduleName, submissionData, agreements, includeAgreements });

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" }
    });
  } finally {
    await browser.close();
  }

  return { fileName, filePath };
}

function decodeImageDataUrl(value) {
  const match = String(value || "").match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase() === "png" ? "png" : "jpg", bytes: Buffer.from(match[2], "base64") };
}

async function renderAgreementPdf({ documentFileName, fields, signatureDataUrl, signerValues = {} }) {
  const fileName = path.basename(String(documentFileName || ""));
  if (!fileName || fileName !== documentFileName) throw new Error("Agreement snapshot document is invalid.");
  const storageDir = path.resolve(__dirname, "../../../../storage/form-agreements");
  const inputPath = path.join(storageDir, fileName);
  const pdfBytes = await fs.promises.readFile(inputPath);
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const missing = [];

  for (const field of fields || []) {
    const fieldId = String(field._id || field.id || "");
    const tag = String(field.tag || "").toLowerCase();
    const type = String(field.type || "").toUpperCase();
    let value = field.value == null ? "" : String(field.value);
    if (tag === "signature.doctor" || (["SIGNATURE", "INITIALS"].includes(type) && tag !== "signature.tenant")) {
      value = signatureDataUrl || "";
    } else if (Object.prototype.hasOwnProperty.call(signerValues, fieldId)) {
      value = String(signerValues[fieldId] ?? "");
    }

    if (field.required !== false && !String(value).trim()) {
      missing.push(field.label || field.tag || "Required agreement field");
      continue;
    }
    if (!value) continue;

    const page = pages[Number(field.page) || 0];
    if (!page) throw new Error(`Agreement field "${field.label || field.tag}" refers to a missing PDF page.`);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = Math.max(0, Math.min(pageWidth, (Number(field.x) || 0) * pageWidth / 100));
    const width = Math.max(1, Math.min(pageWidth - x, (Number(field.w) || 0) * pageWidth / 100));
    const height = Math.max(1, Math.min(pageHeight, (Number(field.h) || 0) * pageHeight / 100));
    const top = Math.max(0, Math.min(pageHeight - height, (Number(field.y) || 0) * pageHeight / 100));
    const y = pageHeight - top - height;

    if (["IMAGE", "SIGNATURE", "INITIALS"].includes(type)) {
      const image = decodeImageDataUrl(value);
      if (!image) throw new Error(`Agreement field "${field.label || field.tag}" has an unsupported image.`);
      const embedded = image.type === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
      const scale = Math.min(width / embedded.width, height / embedded.height);
      const drawWidth = embedded.width * scale;
      const drawHeight = embedded.height * scale;
      page.drawImage(embedded, { x, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
    } else if (type === "CHECKBOX") {
      page.drawRectangle({ x, y, width: Math.min(width, height), height: Math.min(width, height), borderWidth: 1, borderColor: rgb(0.15, 0.15, 0.15) });
      if (value === "checked" || value === "true") {
        page.drawLine({ start: { x: x + 2, y: y + 2 }, end: { x: x + Math.min(width, height) - 2, y: y + Math.min(width, height) - 2 }, thickness: 1.5 });
        page.drawLine({ start: { x: x + 2, y: y + Math.min(width, height) - 2 }, end: { x: x + Math.min(width, height) - 2, y: y + 2 }, thickness: 1.5 });
      }
    } else {
      let size = Math.max(6, Math.min(24, height * 0.68));
      while (size > 6 && font.widthOfTextAtSize(value, size) > width - 4) size -= 0.5;
      page.drawText(value, {
        x: x + 2,
        y: y + Math.max(0, (height - size) / 2),
        size,
        font,
        maxWidth: Math.max(1, width - 4),
        color: rgb(0.08, 0.08, 0.08),
      });
    }
  }

  if (missing.length) throw new Error(`Complete required agreement fields: ${missing.join(", ")}.`);
  return Buffer.from(await pdf.save());
}

async function combineSubmissionPdf({ submissionFilePath, openingAgreementPdf }) {
  const sourceBytes = await fs.promises.readFile(submissionFilePath);
  const sources = [openingAgreementPdf, sourceBytes].filter(Boolean);
  const combined = await PDFDocument.create();
  for (const source of sources) {
    const document = await PDFDocument.load(source);
    const pages = await combined.copyPages(document, document.getPageIndices());
    pages.forEach((page) => combined.addPage(page));
  }
  await fs.promises.writeFile(submissionFilePath, await combined.save());
  return submissionFilePath;
}

module.exports = {
  generateSubmissionPdf,
  buildSubmissionPdfHtml,
  renderAgreementHtml,
  renderAgreementSection,
  renderAgreementPdf,
  combineSubmissionPdf,
};
