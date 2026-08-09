const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      <p>${escapeHtml(agreements.pre.text)}</p>
      <div>Accepted: ${agreements.pre.accepted ? "Yes" : "No"}</div>
      <div class="small">Accepted At: ${agreements.pre.acceptedAt || "-"}</div>
      ${
        agreements.pre.signatureDataUrl
          ? `<img class="signature" src="${agreements.pre.signatureDataUrl}" alt="Opening signature" />`
          : "<div>No signature provided</div>"
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
      <p>${escapeHtml(agreements.post.text)}</p>
      <div>Accepted: ${agreements.post.accepted ? "Yes" : "No"}</div>
      <div class="small">Accepted At: ${agreements.post.acceptedAt || "-"}</div>
      ${
        agreements.post.signatureDataUrl
          ? `<img class="signature" src="${agreements.post.signatureDataUrl}" alt="Closing signature" />`
          : "<div>No signature provided</div>"
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

module.exports = { generateSubmissionPdf };
