const tenantValidator = require("../../src/modules/tenants/tenants.validator");
const roleValidator = require("../../src/modules/roles/roles.validator");
const positionValidator = require("../../src/modules/positions/positions.validator");
const assignmentValidator = require("../../src/modules/assignments/assignments.validator");

function nextMock() {
  return jest.fn();
}

describe("module validators", () => {
  it("tenant validator handles valid and invalid payloads", () => {
    const validReq = { body: { name: "Acme", code: "ACME" } };
    const validNext = nextMock();
    tenantValidator.validate(tenantValidator.createTenantSchema)(validReq, {}, validNext);
    expect(validNext).toHaveBeenCalledWith();

    const badReq = { body: { name: "A" } };
    const badNext = nextMock();
    tenantValidator.validate(tenantValidator.createTenantSchema)(badReq, {}, badNext);
    expect(badNext.mock.calls[0][0].statusCode).toBe(422);
  });

  it("role validator handles valid and invalid payloads", () => {
    const validReq = { body: { name: "Admin", permissionIds: ["p1"] } };
    const validNext = nextMock();
    roleValidator.validate(roleValidator.createRoleSchema)(validReq, {}, validNext);
    expect(validNext).toHaveBeenCalledWith();

    const validCodesReq = { body: { name: "Admin", permissionCodes: ["user.view"] } };
    const validCodesNext = nextMock();
    roleValidator.validate(roleValidator.createRoleSchema)(validCodesReq, {}, validCodesNext);
    expect(validCodesNext).toHaveBeenCalledWith();

    const badReq = { body: { name: "Admin", permissionIds: [], permissionCodes: [] } };
    const badNext = nextMock();
    roleValidator.validate(roleValidator.createRoleSchema)(badReq, {}, badNext);
    expect(badNext.mock.calls[0][0].statusCode).toBe(422);
  });

  it("position validator handles valid and invalid payloads", () => {
    const validReq = { body: { roleId: "r1", levelName: "1L" } };
    const validNext = nextMock();
    positionValidator.validate(positionValidator.createPositionSchema)(validReq, {}, validNext);
    expect(validNext).toHaveBeenCalledWith();

    const badReq = { body: { title: "" } };
    const badNext = nextMock();
    positionValidator.validate(positionValidator.createPositionSchema)(badReq, {}, badNext);
    expect(badNext.mock.calls[0][0].statusCode).toBe(422);
  });

  it("assignment validator handles valid and invalid payloads", () => {
    const validReq = { body: { userId: "u1", positionId: "p1" } };
    const validNext = nextMock();
    assignmentValidator.validate(assignmentValidator.assignSeatSchema)(validReq, {}, validNext);
    expect(validNext).toHaveBeenCalledWith();

    const badReq = { body: { userId: "u1" } };
    const badNext = nextMock();
    assignmentValidator.validate(assignmentValidator.assignSeatSchema)(badReq, {}, badNext);
    expect(badNext.mock.calls[0][0].statusCode).toBe(422);
  });
});
