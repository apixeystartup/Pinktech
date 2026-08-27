const puppeteer = require("puppeteer");
const path = require("node:path");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const htmlPath = path.resolve(__dirname, "..", "QC-REPORT.html");
    const pdfPath = path.resolve(__dirname, "..", "QC-REPORT.pdf");
    await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    console.log(pdfPath);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
