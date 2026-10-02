const tenantValidator = require("../../services/platform-service/src/validators/tenants.validator");
const roleValidator = require("../../services/platform-service/src/validators/roles.validator");

function nextMock() {
  return jest.fn();
}

describe("module validators", () => {
  it("tenant validator handles valid and invalid payloads", () => {
    const validReq = { body: { name: "Acme", code: "ACME", email: "admin@example.com" } };
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

  it("validates tenant updates and rejects empty updates", () => {
    const validNext = nextMock();
    const validReq = { body: { email: "updated@example.com", status: "SUSPENDED" } };
    tenantValidator.validate(tenantValidator.updateTenantSchema)(validReq, {}, validNext);
    expect(validNext).toHaveBeenCalledWith();

    const badNext = nextMock();
    tenantValidator.validate(tenantValidator.updateTenantSchema)({ body: {} }, {}, badNext);
    expect(badNext.mock.calls[0][0].statusCode).toBe(422);
  });

});
