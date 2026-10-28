jest.mock("../../services/org-service/src/models/user.model", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../services/org-service/src/models/role.model", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../services/org-service/src/models/permission.model", () => ({}));
jest.mock("../../services/org-service/src/services/audit.service", () => ({
  writeAudit: jest.fn(),
}));
jest.mock("../../services/org-service/src/services/orgDirectory.service", () => ({}));
jest.mock("../../services/org-service/src/services/orgRoleEngine.service", () => ({
  runOrgRoleEngine: jest.fn(),
}));
jest.mock("../../services/org-service/src/services/positions.service", () => ({
  syncPositionLevelsFromOrg: jest.fn(),
}));

const User = require("../../services/org-service/src/models/user.model");
const Role = require("../../services/org-service/src/models/role.model");
const orgMutations = require("../../services/org-service/src/services/orgMutations.service");
const mongoose = require("mongoose");

describe("organization mutation account protections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("prevents a tenant admin from changing their own reporting line", async () => {
    await expect(
      orgMutations.setManager(
        "tenant-1",
        "admin-1",
        "manager-1",
        { userId: "admin-1", accountRole: "tenant_admin" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("prevents a tenant admin from changing their own role", async () => {
    Role.findOne.mockResolvedValue({ _id: "role-1", name: "Staff", type: "CUSTOM" });

    await expect(
      orgMutations.setRole(
        "tenant-1",
        "admin-1",
        "role-1",
        { userId: "admin-1", accountRole: "tenant_admin" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("prevents a tenant admin from changing another designated admin's reporting line", async () => {
    const targetQuery = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "other-admin",
        email: "other-admin@example.com",
        roleIds: [],
      }),
    };
    User.findOne.mockReturnValue(targetQuery);
    jest.spyOn(mongoose.connection, "collection").mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ adminUserId: "other-admin" }),
    });

    await expect(
      orgMutations.setManager(
        "tenant-1",
        "other-admin",
        "manager-1",
        { userId: "admin-1", accountRole: "tenant_admin" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("prevents tenant admins from creating an administrative designation", async () => {
    await expect(
      orgMutations.addEmployee(
        "tenant-1",
        { name: "New employee", designation: "Regional Admin" },
        { userId: "admin-1", accountRole: "tenant_admin" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(Role.findOne).not.toHaveBeenCalled();
  });
});
