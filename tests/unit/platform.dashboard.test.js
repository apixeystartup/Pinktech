jest.mock("../../services/platform-service/src/models/tenant.model");
jest.mock("../../services/platform-service/src/models/user.model");
jest.mock("../../services/platform-service/src/models/role.model");
jest.mock("../../services/platform-service/src/models/module.model");
jest.mock("../../services/platform-service/src/models/externalUser.model");
jest.mock("../../services/platform-service/src/models/submission.model");

const Tenant = require("../../services/platform-service/src/models/tenant.model");
const User = require("../../services/platform-service/src/models/user.model");
const Role = require("../../services/platform-service/src/models/role.model");
const Module = require("../../services/platform-service/src/models/module.model");
const ExternalUser = require("../../services/platform-service/src/models/externalUser.model");
const Submission = require("../../services/platform-service/src/models/submission.model");
const dashboardService = require("../../services/platform-service/src/services/dashboard.service");

const homeTenantId = "507f1f77bcf86cd799439011";
const selectedTenantId = "507f1f77bcf86cd799439012";
const superAdminId = "507f1f77bcf86cd799439013";
const superAdminRoleId = "507f1f77bcf86cd799439014";

function queryResult(value) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe("platform dashboard tenant context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue(queryResult({
      _id: superAdminId,
      tenantId: homeTenantId,
      roleIds: [superAdminRoleId],
    }));
    Tenant.findById.mockReturnValue(queryResult({ code: "PINKTECH" }));
    Role.find.mockReturnValue(queryResult([{ _id: superAdminRoleId, type: "SYSTEM" }]));
    User.countDocuments.mockResolvedValueOnce(4).mockResolvedValueOnce(9);
    User.find.mockReturnValue(queryResult([{
      _id: "507f1f77bcf86cd799439015",
      name: "Casey Employee",
      email: "casey@example.com",
      empCode: "E-15",
      roleIds: [],
      status: "ACTIVE",
      credentialsSentCount: 2,
      passwordResetRequestedAt: null,
    }]));
    Module.find.mockReturnValue(queryResult([]));
    Module.aggregate.mockResolvedValue([]);
    ExternalUser.countDocuments.mockResolvedValue(2);
    ExternalUser.find.mockReturnValue(queryResult([]));
    ExternalUser.aggregate.mockResolvedValue([]);
  });

  it("returns selected-tenant dashboard data for a super admin", async () => {
    const result = await dashboardService.getDashboardStats({
      userId: superAdminId,
      baseTenantId: homeTenantId,
      actingAsTenantId: selectedTenantId,
    });

    expect(result).toEqual({
      role: "tenant_admin",
      summary: {
        totalEmployees: 4,
        totalUsers: 9,
        totalDoctors: 2,
        formsCreated: 0,
        formsSubmitted: 0,
      },
      employees: [
        expect.objectContaining({
          name: "Casey Employee",
          credentialsSentCount: 2,
          passwordResetRequestedAt: null,
          isAdminAccount: false,
        }),
      ],
      doctors: [],
    });
    expect(String(User.countDocuments.mock.calls[0][0].tenantId)).toBe(selectedTenantId);
    expect(Tenant.find).not.toHaveBeenCalled();
  });

  it("keeps the aggregate platform dashboard on Home", async () => {
    Tenant.find.mockReturnValue(queryResult([]));
    User.aggregate.mockResolvedValue([]);
    Submission.aggregate.mockResolvedValue([]);
    Submission.countDocuments.mockResolvedValue(0);

    const result = await dashboardService.getDashboardStats({
      userId: superAdminId,
      baseTenantId: homeTenantId,
    });

    expect(result.role).toBe("super_admin");
    expect(result.summary.totalTenants).toBe(0);
    expect(Tenant.find).toHaveBeenCalledWith({});
  });
});
