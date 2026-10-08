const {
  buildSubmissionPdfHtml,
  renderAgreementHtml
} = require("../../services/forms-service/src/services/pdfService");
const {
  resolveAgreementText,
  resolveAgreementTexts,
  FALLBACKS
} = require("../../services/forms-service/src/services/agreementText");

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

  it("embeds both agreements as rendered markup", () => {
    expect(html.match(/<h1>HONORARIUM AGREEMENT<\/h1>/g)).toHaveLength(2);
    expect(html.match(/<div class="agreementBody">/g)).toHaveLength(2);
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

  it("survives a missing or malformed module", () => {
    expect(resolveAgreementText(null, "pre")).toBe(FALLBACKS.pre);
    expect(resolveAgreementText({}, "post")).toBe(FALLBACKS.post);
  });

  it("never returns markup with angle brackets stripped", () => {
    const moduleDoc = { formSchema: { settings: { preAgreementText: HONORARIUM } } };

    expect(resolveAgreementText(moduleDoc, "pre")).toBe(HONORARIUM);
  });
});