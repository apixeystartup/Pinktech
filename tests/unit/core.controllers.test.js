const tenantsController = require("../../services/platform-service/src/controllers/tenants.controller");
const rolesController = require("../../services/platform-service/src/controllers/roles.controller");
const positionsController = require("../../services/org-service/src/services/positions.controller");
const assignmentsController = require("../../services/org-service/src/services/assignments.controller");
const tenantsService = require("../../services/platform-service/src/services/tenants.service");
const rolesService = require("../../services/platform-service/src/services/roles.service");
const positionsService = require("../../services/org-service/src/services/positions.service");
const assignmentsService = require("../../services/org-service/src/services/assignments.service");

jest.mock("../../services/platform-service/src/services/tenants.service");
jest.mock("../../services/platform-service/src/services/roles.service");
jest.mock("../../services/org-service/src/services/positions.service");
jest.mock("../../services/org-service/src/services/assignments.service");

function resMock() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), sendStatus: jest.fn() };
}

describe("core controllers", () => {
  it("handles tenant, role, position and assignment controller happy paths", async () => {
    const req = { body: {}, params: { tenantId: "t1", roleId: "r1", positionId: "p1" }, tenantId: "t1", auth: {}, query: {} };
    const res = resMock();
    const next = jest.fn();

    tenantsService.createTenant.mockResolvedValue({ _id: "t1" });
    tenantsService.listTenants.mockResolvedValue([{ _id: "t1" }]);
    tenantsService.updateTenant.mockResolvedValue({ _id: "t1" });
    rolesService.createRole.mockResolvedValue({ _id: "r1" });
    rolesService.listRoles.mockResolvedValue([{ _id: "r1" }]);
    rolesService.updateRole.mockResolvedValue({ _id: "r1" });
    rolesService.deleteRole.mockResolvedValue();
    positionsService.createPosition.mockResolvedValue({ _id: "p1" });
    positionsService.listPositions.mockResolvedValue([{ _id: "p1" }]);
    positionsService.updatePosition.mockResolvedValue({ _id: "p1" });
    positionsService.getSubtree.mockResolvedValue([{ _id: "p1" }]);
    assignmentsService.assignSeat.mockResolvedValue({ _id: "a1" });
    assignmentsService.listAssignments.mockResolvedValue([{ _id: "a1" }]);

    await tenantsController.createTenant(req, res, next);
    await tenantsController.listTenants(req, res, next);
    await tenantsController.updateTenant(req, res, next);
    await rolesController.createRole(req, res, next);
    await rolesController.listRoles(req, res, next);
    await rolesController.updateRole(req, res, next);
    await rolesController.deleteRole(req, res, next);
    await positionsController.createPosition(req, res, next);
    await positionsController.listPositions(req, res, next);
    await positionsController.updatePosition(req, res, next);
    await positionsController.getSubtree(req, res, next);
    await assignmentsController.assignSeat(req, res, next);
    await assignmentsController.listAssignments(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalled();
  });
});
