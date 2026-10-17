const {
  createTemplateSchema,
  updateTemplateSchema,
} = require("../../services/sign-service/src/validators/signTemplate.validator");

describe("signature template field validation", () => {
  test("accepts a Party 1 text field with its saved value", () => {
    const { error, value } = createTemplateSchema.validate({
      name: "Agreement",
      fields: [{ tag: "tenant.custom", type: "TEXT", value: "Fixed Party 1 text" }],
    });

    expect(error).toBeUndefined();
    expect(value.fields[0].value).toBe("Fixed Party 1 text");
  });

  test("rejects a Party 1 text field with a missing or blank value", () => {
    for (const field of [
      { tag: "tenant.custom", type: "TEXT" },
      { tag: "tenant.custom", type: "TEXT", value: "   " },
    ]) {
      const { error } = updateTemplateSchema.validate({ fields: [field] });
      expect(error).toBeDefined();
    }
  });

  test("keeps Party 2 text fields signer-entered", () => {
    const { error } = updateTemplateSchema.validate({
      fields: [{ tag: "custom.party2_text", type: "TEXT" }],
    });

    expect(error).toBeUndefined();
  });

  test("rejects unknown tenant placeholders", () => {
    const { error } = updateTemplateSchema.validate({
      fields: [{ tag: "tenant.unrecognized", type: "TEXT" }],
    });

    expect(error).toBeDefined();
  });
});
