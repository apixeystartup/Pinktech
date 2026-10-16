const ApiError = require("@pink/shared").ApiError;
const mammoth = require("mammoth");
const puppeteer = require("puppeteer");
const pdfParse = require("pdf-parse");

function isPdfBuffer(buffer) {
  return buffer && buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-");
}

function isZipBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Normalize an uploaded agreement into PDF bytes so the signing designer has a
 * stable set of pages to place fields on. PDFs pass through untouched; Word
 * (.docx) documents are rendered through mammoth -> puppeteer.
 */
async function normalizeAgreementUpload(file) {
  if (!file) throw new ApiError(422, "Attach the agreement file (form field \"file\").");
  const buffer = file.buffer;
  const originalName = String(file.originalname || "agreement.pdf");
  const lower = originalName.toLowerCase();
  const isPdfByName = lower.endsWith(".pdf");
  const isDocxByName = lower.endsWith(".docx") || lower.endsWith(".doc");
  const isDocxByMime = (file.mimetype || "").toLowerCase().includes("wordprocessingml") ||
    (file.mimetype || "").toLowerCase().includes("msword");

  if (isPdfBuffer(buffer) || (isPdfByName && !isDocxByName)) {
    if (!isPdfBuffer(buffer)) throw new ApiError(422, "That file is not a PDF.");
    return { buffer, mimeType: "application/pdf", originalName };
  }

  if (isDocxByMime || isDocxByName) {
    if (!isZipBuffer(buffer)) {
      throw new ApiError(422, "Legacy .doc files cannot be opened directly. Please save the agreement as .docx or PDF.");
    }
    let html;
    try {
      const result = await mammoth.convertToHtml({ buffer });
      html = String(result.value || "").trim();
    } catch (err) {
      throw new ApiError(422, "Could not read that Word document: " + (err?.message || "")); }
    if (!html || html.replace(/<[^>]+>/g, "").trim() === "") {
      throw new ApiError(422, "That Word document looks empty — add the agreement text first.");
    }

    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 25mm; }
  body { font-family: "Liberation Serif","Times New Roman",serif; font-size: 11pt; line-height: 1.45; color: #111; }
  h1,h2,h3 { margin: 0.9em 0 0.35em; }
  p { margin: 0.4em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td,th { border: 1px solid #666; padding: 4px 6px; vertical-align: top; }
  img { max-width: 100%; }
</style></head><body>${html}</body></html>`;

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 30000 });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      return { buffer: Buffer.from(pdfBuffer), mimeType: "application/pdf", originalName: originalName.replace(/\.(docx?|doc)$/i, ".pdf") };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new ApiError(422, "Unsupported file type. Please upload a PDF or a Word (.docx) agreement.");
}

async function countPdfPages(buffer) {
  try {
    const parsed = await pdfParse(buffer);
    return Number(parsed?.numpages) || 0;
  } catch { return 0; }
}

module.exports = { normalizeAgreementUpload, countPdfPages, isPdfBuffer };
