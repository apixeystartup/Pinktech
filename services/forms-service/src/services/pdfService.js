const fs = require("fs");
const path = require("path");

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
// exactly like the Opening/Closing Agreement cards in the form.
const AGREEMENT_ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "br", "hr", "blockquote"
]);

const VOID_TAGS = new Set(["br", "hr"]);

function sanitizeAgreementHtml(input) {
  return String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, rawTag) => {
      const tag = String(rawTag).toLowerCase();
      if (!AGREEMENT_ALLOWED_TAGS.has(tag)) return "";
      const isClosing = /^<\s*\//.test(match);
      if (VOID_TAGS.has(tag)) return isClosing ? "" : `<${tag} />`;
      return isClosing ? `</${tag}>` : `<${tag}>`;
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

function buildSubmissionPdfHtml({ moduleName, submissionData, agreements }) {
  const rows = Object.entries(submissionData || {})
    .map(
      ([key, value]) =>
        `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(toDisplayValue(value))}</td></tr>`
    )
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
      table { width: 100%; border-collapse: collapse; }
      td, th { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #fdf0f7; }
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
    </style>
  </head>
  <body>
    <h1>Form Submission Packet</h1>
    <div class="small">Generated at: ${new Date().toISOString()}</div>
    <div class="section">
      <h2>Form</h2>
      <div>${escapeHtml(moduleName)}</div>
    </div>

    <div class="section agreementBox">
      <h2>Opening Agreement</h2>
      <div class="agreementBody">${renderAgreementHtml(agreements.pre?.text)}</div>
      <div class="agreementMeta">Accepted: ${agreements.pre.accepted ? "Yes" : "No"}</div>
      <div class="agreementMeta">Accepted At: ${escapeHtml(agreements.pre.acceptedAt || "-")}</div>
      ${
        agreements.pre.signatureDataUrl
          ? `<img class="signature" src="${agreements.pre.signatureDataUrl}" alt="Opening signature" />`
          : '<div class="muted">No signature provided</div>'
      }
    </div>

    <div class="section">
      <h2>Submitted Form Data</h2>
      <table>
        <thead><tr><th>Field</th><th>Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="section agreementBox">
      <h2>Closing Agreement</h2>
      <div class="agreementBody">${renderAgreementHtml(agreements.post?.text)}</div>
      <div class="agreementMeta">Accepted: ${agreements.post.accepted ? "Yes" : "No"}</div>
      <div class="agreementMeta">Accepted At: ${escapeHtml(agreements.post.acceptedAt || "-")}</div>
      ${
        agreements.post.signatureDataUrl
          ? `<img class="signature" src="${agreements.post.signatureDataUrl}" alt="Closing signature" />`
          : '<div class="muted">No signature provided</div>'
      }
    </div>
  </body>
</html>`;
}

async function generateSubmissionPdf({ submissionId, moduleName, submissionData, agreements }) {
  const storageDir = path.join(process.cwd(), "storage", "pdfs");
  fs.mkdirSync(storageDir, { recursive: true });

  const fileName = `submission-${submissionId}.pdf`;
  const filePath = path.join(storageDir, fileName);
  const html = buildSubmissionPdfHtml({ moduleName, submissionData, agreements });

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

module.exports = { generateSubmissionPdf, buildSubmissionPdfHtml, renderAgreementHtml };
