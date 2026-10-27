const auditService = require("../../services/platform-service/src/services/audit.service");
const AuditLog = require("../../services/platform-service/src/models/auditLog.model");

jest.mock("../../services/platform-service/src/models/auditLog.model");

describe("audit.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes audit log with provided payload", async () => {
    AuditLog.create.mockResolvedValue({ _id: "log-1" });

    await auditService.writeAudit({
      tenantId: "tenant-1",
      userId: "user-1",
      action: "AUTH_LOGIN",
      metadata: { email: "john@test.com" },
    });

    expect(AuditLog.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      action: "AUTH_LOGIN",
      status: "SUCCESS",
      errorMessage: null,
      metadata: { email: "john@test.com" },
      durationMs: null,
    });
  });

  it("defaults optional fields when not provided", async () => {
    AuditLog.create.mockResolvedValue({ _id: "log-2" });

    await auditService.writeAudit({
      action: "SYSTEM_EVENT",
    });

    expect(AuditLog.create).toHaveBeenCalledWith({
      tenantId: null,
      userId: null,
      action: "SYSTEM_EVENT",
      status: "SUCCESS",
      errorMessage: null,
      metadata: {},
      durationMs: null,
    });
  });

  it("records elapsed request time when request context is available", async () => {
    const { requestContextMiddleware } = require("../../shared/src/requestContext");
    AuditLog.create.mockResolvedValue({ _id: "log-3" });

    await new Promise((resolve, reject) => {
      requestContextMiddleware({}, {}, async () => {
        try {
          await new Promise((done) => setTimeout(done, 2));
          await auditService.writeAudit({ action: "SYSTEM_EVENT" });
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SYSTEM_EVENT", durationMs: expect.any(Number) }),
    );
  });
});
