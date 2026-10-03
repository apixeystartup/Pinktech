const mockSendMail = jest.fn();

const { classify, sendEmail, resetTransporters, setTransportFactory } = require("@pink/shared/mailer");

const ENV_KEYS = [
  "EMAIL_MODE",
  "EMAIL_PROVIDERS",
  "EMAIL_FROM",
  "EMAIL_CHAIN_TIMEOUT_MS",
  "EMAIL_PROVIDER_RESEND_HOST",
  "EMAIL_PROVIDER_RESEND_PORT",
  "EMAIL_PROVIDER_RESEND_USER",
  "EMAIL_PROVIDER_RESEND_PASS",
  "EMAIL_PROVIDER_BREVO_HOST",
  "EMAIL_PROVIDER_BREVO_PORT",
  "EMAIL_PROVIDER_BREVO_USER",
  "EMAIL_PROVIDER_BREVO_PASS",
];

describe("mailer error classification", () => {
  it("fails over when a provider reports a quota limit", () => {
    expect(classify({ code: "EENVELOPE", responseCode: 429, response: "daily_quota_exceeded" })).toBe("failover");
    expect(classify({ message: "Too many requests" })).toBe("failover");
    expect(classify({ message: "rate limit exceeded" })).toBe("failover");
    expect(classify({ message: "sending limit reached" })).toBe("failover");
  });

  it("fails over on transient SMTP and network failures", () => {
    expect(classify({ code: "ECONNREFUSED" })).toBe("failover");
    expect(classify({ code: "EDNS" })).toBe("failover");
    expect(classify({ code: "EHOSTUNREACH" })).toBe("failover");
    expect(classify({ responseCode: 421 })).toBe("failover");
    expect(classify({ responseCode: 451 })).toBe("failover");
  });

  it("never fails over on bad credentials, to avoid burning the next provider's quota", () => {
    expect(classify({ code: "EAUTH", responseCode: 535 })).toBe("abort");
    expect(classify({ code: "EAUTH", message: "535 Incorrect authentication data" })).toBe("abort");
  });

  it("never fails over when the recipient is permanently invalid", () => {
    expect(classify({ responseCode: 550, message: "No such user" })).toBe("abort");
    expect(classify({ responseCode: 551 })).toBe("abort");
    expect(classify({ code: "EENVELOPE", responseCode: 553, message: "Sender rejected" })).toBe("abort");
  });

  it("never fails over on an ambiguous timeout, which could duplicate a message", () => {
    expect(classify({ code: "ETIMEDOUT" })).toBe("abort");
    expect(classify({ code: "ECONNRESET" })).toBe("abort");
    expect(classify({ code: "ESOCKET" })).toBe("abort");
  });

  it("aborts on unknown errors rather than spraying providers", () => {
    expect(classify({ message: "something unexpected" })).toBe("abort");
    expect(classify(null)).toBe("abort");
  });
});

describe("mailer sendEmail", () => {
  const original = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // Injected rather than jest.mock("nodemailer"): this suite runs alongside
    // tests that requireActual the shared barrel, which makes module-level
    // nodemailer mocking order-dependent.
    setTransportFactory(() => ({ sendMail: mockSendMail }));
    ENV_KEYS.forEach((k) => {
      original[k] = process.env[k];
      delete process.env[k];
    });
    process.env.EMAIL_MODE = "smtp";
    process.env.EMAIL_PROVIDERS = "resend,brevo";
    process.env.EMAIL_FROM = "no-reply@notify.example.com";
    process.env.EMAIL_PROVIDER_RESEND_HOST = "smtp.resend.com";
    process.env.EMAIL_PROVIDER_RESEND_PORT = "465";
    process.env.EMAIL_PROVIDER_RESEND_USER = "resend";
    process.env.EMAIL_PROVIDER_RESEND_PASS = "re_test";
    process.env.EMAIL_PROVIDER_BREVO_HOST = "smtp-relay.brevo.com";
    process.env.EMAIL_PROVIDER_BREVO_PORT = "587";
    process.env.EMAIL_PROVIDER_BREVO_USER = "login@example.com";
    process.env.EMAIL_PROVIDER_BREVO_PASS = "smtp-key";
  });

  afterAll(() => {
    setTransportFactory(null);
    ENV_KEYS.forEach((k) => {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    });
  });

  it("uses the first provider when it succeeds", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "id-1" });

    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("resend");
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("falls over to the next provider on a quota error", async () => {
    mockSendMail
      .mockRejectedValueOnce({ code: "EENVELOPE", responseCode: 429, response: "daily_quota_exceeded" })
      .mockResolvedValueOnce({ messageId: "id-2" });

    const result = await sendEmail({ to: "user@example.com", subject: "OTP", html: "<p>123</p>" });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("brevo");
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("stops at an auth error instead of silently retrying elsewhere", async () => {
    mockSendMail.mockRejectedValue({ code: "EAUTH", responseCode: 535 });

    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(result.ok).toBe(false);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("never throws, so forgot-password cannot become a user-enumeration oracle", async () => {
    mockSendMail.mockRejectedValue({ code: "EAUTH", responseCode: 535 });

    await expect(sendEmail({ to: "user@example.com", subject: "Reset", html: "x" })).resolves.toBeDefined();
  });

  it("reports failure when no provider is configured", async () => {
    process.env.EMAIL_PROVIDERS = "resend";
    delete process.env.EMAIL_PROVIDER_RESEND_PASS;

    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "x" });

    expect(result.ok).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("skips a send with no recipient", async () => {
    const result = await sendEmail({ subject: "Hi", html: "x" });
    expect(result.ok).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("logs instead of sending in mock mode", async () => {
    process.env.EMAIL_MODE = "mock";
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "x" });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("mock");
    expect(mockSendMail).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});