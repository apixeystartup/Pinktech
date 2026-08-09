const jwt = require("jsonwebtoken");
const authMiddleware = require("../../src/middlewares/auth.middleware");
const User = require("../../src/models/user.model");
const Role = require("../../src/models/role.model");
const Tenant = require("../../src/models/tenant.model");

jest.mock("jsonwebtoken");
jest.mock("../../src/models/user.model");
jest.mock("../../src/models/role.model");
jest.mock("../../src/models/tenant.model");

describe("authMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when token missing", async () => {
    const req = { headers: {} };
    const next = jest.fn();

    await authMiddleware(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("returns 401 when token invalid", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid");
    });
    const req = { headers: { authorization: "Bearer bad-token" } };
    const next = jest.fn();

    await authMiddleware(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("returns 401 when user is not active", async () => {
    jwt.verify.mockReturnValue({
      userId: "u-1",
      tenantId: "t-1",
      roleIds: ["r-1"],
    });
    User.findById.mockResolvedValue({ status: "DISABLED" });
    const req = { headers: { authorization: "Bearer valid-token" } };
    const next = jest.fn();

    await authMiddleware(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("sets req.auth with permissionCodes when token is valid", async () => {
    jwt.verify.mockReturnValue({
      userId: "u-1",
      tenantId: "t-1",
      roleIds: ["r-1"],
      positionId: "p-1",
    });
    User.findById.mockResolvedValue({ _id: "u-1", status: "ACTIVE" });
    Tenant.findById.mockResolvedValue({ _id: "t-1", status: "ACTIVE" });
    Role.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        {
          permissionIds: [{ code: "user.invite" }, { code: "user.view" }],
        },
      ]),
    });
    const req = { headers: { authorization: "Bearer good-token" } };
    const next = jest.fn();

    await authMiddleware(req, {}, next);

    expect(req.auth.permissionCodes).toEqual(["user.invite", "user.view"]);
    expect(next).toHaveBeenCalledWith();
  });
});
