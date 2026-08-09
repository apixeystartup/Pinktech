const auditService = require("../../src/services/audit.service");
const AuditLog = require("../../src/models/auditLog.model");

jest.mock("../../src/models/auditLog.model");

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
      metadata: { email: "john@test.com" },
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
      metadata: {},
    });
  });
});
