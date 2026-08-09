const tenantsService = require("../../src/modules/tenants/tenants.service");
const rolesService = require("../../src/modules/roles/roles.service");
const positionsService = require("../../src/modules/positions/positions.service");
const assignmentsService = require("../../src/modules/assignments/assignments.service");
const hierarchyService = require("../../src/modules/positions/hierarchy.service");
const Tenant = require("../../src/models/tenant.model");
const Role = require("../../src/models/role.model");
const Position = require("../../src/models/position.model");
const Assignment = require("../../src/models/assignment.model");
const User = require("../../src/models/user.model");
const Permission = require("../../src/models/permission.model");
const auditService = require("../../src/services/audit.service");

jest.mock("../../src/models/tenant.model");
jest.mock("../../src/models/role.model");
jest.mock("../../src/models/position.model");
jest.mock("../../src/models/assignment.model");
jest.mock("../../src/models/user.model");
jest.mock("../../src/models/permission.model");
jest.mock("../../src/services/audit.service");

describe("core services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates and updates tenant", async () => {
    Tenant.findOne.mockResolvedValue(null);
    Tenant.create.mockResolvedValue({ _id: "t1", code: "ACME" });
    Tenant.findByIdAndUpdate.mockResolvedValue({ _id: "t1", name: "Acme" });
    Tenant.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: "t1" }]) });

    const created = await tenantsService.createTenant({ name: "Acme", code: "acme" }, { userId: "u1" });
    const listed = await tenantsService.listTenants();
    const updated = await tenantsService.updateTenant("t1", { plan: "pro" }, { userId: "u1" });
    const tenantOid = "507f1f77bcf86cd799439011";
    Tenant.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: tenantOid, name: "Acme", code: "ACME" }),
    });
    const current = await tenantsService.getCurrentTenant(tenantOid);

    expect(created.code).toBe("ACME");
    expect(listed).toHaveLength(1);
    expect(updated._id).toBe("t1");
    expect(current.name).toBe("Acme");
  });

  it("creates, lists, updates role", async () => {
    Role.findOne.mockResolvedValueOnce(null);
    Role.create.mockResolvedValue({ _id: "r1" });
    Role.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: "r1" }) });
    Role.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([{ _id: "r1" }]) });
    const roleDoc = {
      _id: "r1",
      name: "Admin",
      aliases: [],
      permissionIds: ["p1"],
      override: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    Role.findOne.mockResolvedValueOnce(roleDoc);

    const created = await rolesService.createRole("t1", { name: "Admin", permissionIds: ["p1"] }, { userId: "u1" });
    const listed = await rolesService.listRoles("t1");
    const updated = await rolesService.updateRole("t1", "r1", { name: "Admin2" }, { userId: "u1" });

    expect(created._id).toBe("r1");
    expect(listed[0]._id).toBe("r1");
    expect(updated._id).toBe("r1");
    expect(roleDoc.save).toHaveBeenCalled();
  });

  it("creates role using permission codes resolved to ids", async () => {
    Role.findOne.mockResolvedValue(null);
    Permission.find.mockResolvedValue([{ _id: "p9", code: "user.view" }]);
    Role.create.mockImplementation((doc) => Promise.resolve({ _id: "r9", ...doc }));
    Role.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: "r9" }) });

    const created = await rolesService.createRole(
      "t1",
      { name: "FromCodes", permissionCodes: ["user.view"], permissionIds: [] },
      { userId: "u1" },
    );

    expect(Permission.find).toHaveBeenCalledWith({ code: { $in: ["user.view"] } });
    expect(Role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionIds: ["p9"],
        name: "FromCodes",
      }),
    );
    expect(created._id).toBe("r9");
  });

  it("deletes custom role and blocks system role delete", async () => {
    Role.findOne.mockResolvedValueOnce({ _id: "r1", type: "CUSTOM" });
    Role.deleteOne.mockResolvedValue({ deletedCount: 1 });
    await rolesService.deleteRole("t1", "r1", { userId: "u1" });
    expect(Role.deleteOne).toHaveBeenCalledWith({ _id: "r1", tenantId: "t1" });

    Role.findOne.mockResolvedValueOnce({ _id: "r2", type: "SYSTEM" });
    await expect(rolesService.deleteRole("t1", "r2", { userId: "u1" })).rejects.toThrow();
  });

  it("creates and updates position and subtree", async () => {
    Role.findOne.mockResolvedValue({ _id: "role1", name: "TL" });
    Position.findOne.mockResolvedValueOnce({ _id: "p0", status: "ACTIVE" }).mockResolvedValueOnce(null);
    Position.create.mockResolvedValue({ _id: "p1" });
    const listQuery = {};
    listQuery.populate = jest.fn().mockReturnValue(listQuery);
    listQuery.sort = jest.fn().mockResolvedValue([{ _id: "p1" }]);
    Position.find.mockReturnValueOnce(listQuery).mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue([
        { _id: "p1", parentPositionId: null },
        { _id: "p2", parentPositionId: "p1" },
      ]),
    });
    Position.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: "p1" }),
      }),
    });

    const created = await positionsService.createPosition(
      "t1",
      { roleId: "role1", levelName: "1L", parentPositionId: "p0" },
      { userId: "u1" },
    );
    const listed = await positionsService.listPositions("t1");
    const updated = await positionsService.updatePosition("t1", "p1", { title: "TL2" }, { userId: "u1" });
    const ids = await hierarchyService.getSubtreePositionIds("t1", "p1");

    expect(created._id).toBe("p1");
    expect(listed).toHaveLength(1);
    expect(updated._id).toBe("p1");
    expect(ids).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("assigns seat and lists assignments with filters", async () => {
    User.findOne.mockResolvedValue({ _id: "u1" });
    Position.findOne.mockResolvedValue({ _id: "p1", status: "ACTIVE" });
    Assignment.create.mockResolvedValue({ _id: "a1" });
    Assignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([{ _id: "a1" }]),
      }),
    });

    const assignment = await assignmentsService.assignSeat("t1", { userId: "u1", positionId: "p1" }, { userId: "u2" });
    const listed = await assignmentsService.listAssignments("t1", { userId: "u1", isCurrent: "true" });

    expect(assignment._id).toBe("a1");
    expect(listed[0]._id).toBe("a1");
    expect(auditService.writeAudit).toHaveBeenCalled();
  });
});
