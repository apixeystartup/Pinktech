const {
  buildSubmissionPdfHtml,
  renderAgreementHtml,
  renderAgreementPdf,
  combineSubmissionPdf
} = require("../../services/forms-service/src/services/pdfService");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const {
  resolveAgreementText,
  resolveAgreementTexts,
  FALLBACKS
} = require("../../services/forms-service/src/services/agreementText");
const { agreementSignerValues } = require("../../services/forms-service/src/services/agreementSignerValues");

describe("agreementSignerValues", () => {
  const signature = "data:image/png;base64,YQ==";

  it("requires every Party 2 custom field even if the template marked it optional", () => {
    expect(() => agreementSignerValues({
      fields: [{ _id: "party2-custom", tag: "custom.party2_text", type: "TEXT", required: false, label: "Party 2 text" }]
    }, {}, signature, "opening")).toThrow('Complete the required opening agreement field "Party 2 text".');
  });

  it("accepts completed Party 2 custom fields and preserves resolved Party 1 fields", () => {
    const result = agreementSignerValues({
      fields: [
        { _id: "party1", tag: "tenant.custom", type: "TEXT", value: "Fixed Party 1 value" },
        { _id: "party2", tag: "custom.party2_text", type: "TEXT", required: false, label: "Party 2 text" }
      ]
    }, { party2: "Doctor-provided value" }, signature, "closing");

    expect(result).toEqual({ party2: "Doctor-provided value" });
  });
});

const HONORARIUM =
  "<h1>HONORARIUM AGREEMENT</h1><p>Entered into on <strong>25 August 2026</strong>, by and " +
  "between:</p><h2>Purpose of Engagement</h2><p>The Company wishes to engage the " +
  "<strong>Consultant</strong>.</p><ul><li>Scope</li><li>Fees</li></ul>";

describe("renderAgreementHtml", () => {
  it("keeps every allowed tag so the PDF shows real headings and bold text", () => {
    expect(renderAgreementHtml(HONORARIUM)).toBe(HONORARIUM);
  });

  it("does not leak attributes or scripts", () => {
    const html = renderAgreementHtml(
      '<h1 onclick="steal()">Title</h1><script>alert(1)</script><p class="x">Body</p>'
    );

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("script");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Body</p>");
  });

  it("unwraps disallowed tags but keeps their text", () => {
    const html = renderAgreementHtml("<div><table><tr><td>Cell</td></tr></table></div>");

    expect(html).toBe("Cell");
  });

  it("structures plain-text agreements instead of printing them raw", () => {
    const html = renderAgreementHtml(
      ["SERVICE TERMS", "", "First paragraph line one.", "Second line continues it.", "", "- Clause A", "- Clause B"].join("\n")
    );

    expect(html).toContain("<p>SERVICE TERMS</p>");
    expect(html).toContain("<p>First paragraph line one. Second line continues it.</p>");
    expect(html).toContain("<ul><li>Clause A</li><li>Clause B</li></ul>");
  });

  it("applies markdown emphasis inside plain text", () => {
    const html = renderAgreementHtml("I accept the **terms** and the _policy_.");

    expect(html).toContain("<strong>terms</strong>");
    expect(html).toContain("<em>policy</em>");
  });

  it("returns a placeholder when no agreement text was recorded", () => {
    expect(renderAgreementHtml("")).toContain("No agreement text recorded");
    expect(renderAgreementHtml(undefined)).toContain("No agreement text recorded");
  });
});

describe("buildSubmissionPdfHtml", () => {
  const html = buildSubmissionPdfHtml({
    moduleName: "Consultant Onboarding",
    submissionData: { FullName: "Dr. Shekawat", City: "Raipur" },
    agreements: {
      pre: { accepted: true, text: HONORARIUM, acceptedAt: "2026-08-25T10:00:00.000Z" },
      post: { accepted: true, text: HONORARIUM, acceptedAt: "2026-08-25T10:05:00.000Z" }
    }
  });

  it("renders only the opening agreement, even if legacy closing data exists", () => {
    expect(html.match(/<h1>HONORARIUM AGREEMENT<\/h1>/g)).toHaveLength(1);
    expect(html.match(/<div class="agreementBody">/g)).toHaveLength(1);
    expect(html).not.toContain("Closing Agreement");
  });

  it("styles the agreement body so headings and lists print correctly", () => {
    expect(html).toContain(".agreementBody h1");
    expect(html).toContain(".agreementBody ul");
  });

  it("escapes user-supplied form values", () => {
    const escaped = buildSubmissionPdfHtml({
      moduleName: "<img src=x onerror=alert(1)>",
      submissionData: { Note: "<script>alert(2)</script>" },
      agreements: {
        pre: { accepted: true, text: HONORARIUM },
        post: { accepted: true, text: HONORARIUM }
      }
    });

    expect(escaped).not.toContain("<script>alert(2)</script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("can generate a data-only response section for an agreement packet", () => {
    const html = buildSubmissionPdfHtml({
      moduleName: "Form",
      submissionData: { Name: "Dr. Example" },
      includeAgreements: false,
      agreements: {
        pre: { accepted: true, text: "Opening text" },
        post: { accepted: true, text: "Closing text" }
      }
    });

    expect(html).toContain("Submitted Form Data");
    expect(html).not.toContain("Opening text");
    expect(html).not.toContain("Closing text");
  });

  it("renders form responses as printable cards with readable field labels", () => {
    const html = buildSubmissionPdfHtml({
      moduleName: "Consent Form",
      submissionData: { fullName: "MR", email: "mrinnocent2209@gmail.com", notes: "" },
      includeAgreements: false,
      agreements: {}
    });

    expect(html).toContain('<span class="responseCount">3 responses</span>');
    expect(html).toContain('<div class="responseLabel">Full Name</div>');
    expect(html).toContain('<div class="responseLabel">Email</div>');
    expect(html).toContain('<div class="responseValue">No response</div>');
    expect(html).toContain(".responseGrid { display: grid;");
    expect(html).toContain("break-inside: avoid");
    expect(html).not.toContain("<table>");
  });

  it("uses the product's current visual system for printable submission packets", () => {
    const html = buildSubmissionPdfHtml({
      moduleName: "Consultant Onboarding",
      submissionData: {},
      includeAgreements: false,
      agreements: {}
    });

    expect(html).toContain('<div class="packetBrand">Pinktech · Submission record</div>');
    expect(html).toContain("<h1>Form submission</h1>");
    expect(html).toContain(".packetHeader {");
    expect(html).toContain("@page { size: A4; margin: 18mm; }");
    expect(html).toContain('<span class="formMetaLabel">Form</span>');
    expect(html).toContain('<div class="formMetaValue">Consultant Onboarding</div>');
  });

  it("shows an empty state when a submission has no form responses", () => {
    const html = buildSubmissionPdfHtml({
      moduleName: "Consent Form",
      submissionData: {},
      includeAgreements: false,
      agreements: {}
    });

    expect(html).toContain('<div class="responseEmpty">No form responses were submitted.</div>');
    expect(html).toContain('<span class="responseCount">0 responses</span>');
  });
});

describe("generateSubmissionPdf", () => {
  it("retries on Linux without Chromium sandbox when sandbox initialization is unavailable", async () => {
    const fileName = `submission-sandbox-test-${Date.now()}.pdf`;
    const outputPath = path.resolve(process.cwd(), "storage", "pdfs", fileName);
    const secondFileName = `${fileName.replace(/\.pdf$/, "")}-second.pdf`;
    const secondOutputPath = path.resolve(process.cwd(), "storage", "pdfs", secondFileName);
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { ...platformDescriptor, value: "linux" });
    const page = { setContent: jest.fn(), pdf: jest.fn(), close: jest.fn() };
    const browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn(), on: jest.fn() };
    const mockLaunch = jest.fn()
      .mockRejectedValueOnce(new Error("Failed to launch: No usable sandbox!"))
      .mockResolvedValueOnce(browser);
    let generate;
    let closeBrowser;

    jest.resetModules();
    jest.doMock("puppeteer", () => ({ launch: mockLaunch }));
    try {
      jest.isolateModules(() => {
        ({ generateSubmissionPdf: generate, closePdfBrowser: closeBrowser } = require("../../services/forms-service/src/services/pdfService"));
      });
      const result = await generate({
        submissionId: fileName.replace(/^submission-/, "").replace(/\.pdf$/, ""),
        moduleName: "Onboarding",
        submissionData: { name: "Dr. Example" },
        agreements: {},
      });

      expect(result.fileName).toBe(fileName);
      expect(mockLaunch).toHaveBeenNthCalledWith(1, { headless: true });
      expect(mockLaunch).toHaveBeenNthCalledWith(2, {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      expect(page.setContent).toHaveBeenCalledWith(expect.stringContaining("Onboarding"), { waitUntil: "load" });
      expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({ path: outputPath, format: "A4" }));
      await generate({
        submissionId: secondFileName.replace(/^submission-/, "").replace(/\.pdf$/, ""),
        moduleName: "Onboarding",
        submissionData: { name: "Dr. Example" },
        agreements: {},
      });
      expect(mockLaunch).toHaveBeenCalledTimes(2);
      expect(browser.newPage).toHaveBeenCalledTimes(2);
      expect(page.close).toHaveBeenCalledTimes(2);
      await closeBrowser();
      expect(browser.close).toHaveBeenCalledTimes(1);
    } finally {
      if (closeBrowser) await closeBrowser();
      jest.dontMock("puppeteer");
      jest.resetModules();
      await fs.promises.rm(outputPath, { force: true });
      await fs.promises.rm(secondOutputPath, { force: true });
      Object.defineProperty(process, "platform", platformDescriptor);
    }
  });

  it("does not disable the sandbox for unrelated Chromium launch failures", async () => {
    const mockLaunch = jest.fn().mockRejectedValue(new Error("Browser executable not found."));
    let generate;
    let closeBrowser;

    jest.resetModules();
    jest.doMock("puppeteer", () => ({ launch: mockLaunch }));
    try {
      jest.isolateModules(() => {
        ({ generateSubmissionPdf: generate, closePdfBrowser: closeBrowser } = require("../../services/forms-service/src/services/pdfService"));
      });
      await expect(generate({
        submissionId: `sandbox-failure-${Date.now()}`,
        moduleName: "Onboarding",
        submissionData: {},
        agreements: {},
      })).rejects.toThrow("Browser executable not found.");
      expect(mockLaunch).toHaveBeenCalledTimes(1);
    } finally {
      if (closeBrowser) await closeBrowser();
      jest.dontMock("puppeteer");
      jest.resetModules();
    }
  });
});

describe("uploaded agreement packet PDFs", () => {
  it("stamps required signer values into the snapshotted agreement", async () => {
    const storageDir = path.resolve(__dirname, "../../storage/form-agreements");
    const fileName = `agreement-test-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;
    const inputPath = path.join(storageDir, fileName);
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    await fs.promises.mkdir(storageDir, { recursive: true });
    await fs.promises.writeFile(inputPath, await source.save());
    try {
      const output = await renderAgreementPdf({
        documentFileName: fileName,
        fields: [
          { _id: "custom-name", tag: "custom.name", type: "TEXT", x: 10, y: 10, w: 30, h: 5, required: true },
          { _id: "doctor-signature", tag: "signature.doctor", type: "SIGNATURE", x: 10, y: 20, w: 30, h: 10, required: true }
        ],
        signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        signerValues: { "custom-name": "Dr. Example" }
      });
      const rendered = await PDFDocument.load(output);
      expect(rendered.getPageCount()).toBe(1);
      await expect(renderAgreementPdf({
        documentFileName: fileName,
        fields: [
          { _id: "custom-name", tag: "custom.name", type: "TEXT", x: 10, y: 10, w: 30, h: 5, required: true }
        ],
        signatureDataUrl: "",
        signerValues: {}
      })).rejects.toThrow('Complete required agreement fields:');
    } finally {
      await fs.promises.unlink(inputPath);
    }
  });

  it("combines the opening agreement before the form response without a closing agreement", async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pink-form-packet-"));
    const submissionPath = path.join(directory, "submission.pdf");
    const makePdf = async (size) => {
      const pdf = await PDFDocument.create();
      pdf.addPage([size, size]);
      return pdf.save();
    };
    try {
      await fs.promises.writeFile(submissionPath, await makePdf(200));
      await combineSubmissionPdf({
        submissionFilePath: submissionPath,
        openingAgreementPdf: await makePdf(100)
      });
      const combined = await PDFDocument.load(await fs.promises.readFile(submissionPath));
      expect(combined.getPages().map((page) => page.getWidth())).toEqual([100, 200]);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});

describe("resolveAgreementText", () => {
  it("prefers the module's authored text over the browser round-trip", () => {
    const moduleDoc = {
      formSchema: { settings: { preAgreementText: HONORARIUM, postAgreementText: HONORARIUM } }
    };

    expect(resolveAgreementText(moduleDoc, "pre")).toBe(HONORARIUM);
    expect(resolveAgreementTexts(moduleDoc)).toEqual({ pre: HONORARIUM, post: HONORARIUM });
  });

  it("falls back to the defaults when a module has no agreement text", () => {
    const moduleDoc = { formSchema: { settings: {} } };

    expect(resolveAgreementText(moduleDoc, "pre")).toBe(FALLBACKS.pre);
    expect(resolveAgreementText(moduleDoc, "post")).toBe(FALLBACKS.post);
  });

  it("promotes the legacy post agreement into the single opening agreement", () => {
    const moduleDoc = { formSchema: { settings: { postAgreementText: "Legacy agreement" } } };

    expect(resolveAgreementText(moduleDoc, "pre")).toBe("Legacy agreement");
  });

  it("survives a missing or malformed module", () => {
    expect(resolveAgreementText(null, "pre")).toBe(FALLBACKS.pre);
    expect(resolveAgreementText({}, "post")).toBe(FALLBACKS.post);
  });

  it("never returns markup with angle brackets stripped", () => {
    const moduleDoc = { formSchema: { settings: { preAgreementText: HONORARIUM } } };

    expect(resolveAgreementText(moduleDoc, "pre")).toBe(HONORARIUM);
  });
});