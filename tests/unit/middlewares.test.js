const permissionMiddleware = require("../../services/org-service/src/middlewares/permission.middleware");

describe("permissionMiddleware", () => {
  it("passes when permission exists", () => {
    const req = { auth: { permissionCodes: ["user.invite"] } };
    const next = jest.fn();

    permissionMiddleware("user.invite")(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 when permission missing", () => {
    const req = { auth: { permissionCodes: ["user.view"] } };
    const next = jest.fn();

    permissionMiddleware("user.invite")(req, {}, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("Missing permission");
  });

  it("passes when any of several permissions is present", () => {
    const req = { auth: { permissionCodes: ["workflow.submit"] } };
    const next = jest.fn();

    permissionMiddleware(["kyc.manage", "workflow.submit"])(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 when none of several permissions is present", () => {
    const req = { auth: { permissionCodes: ["user.view"] } };
    const next = jest.fn();

    permissionMiddleware(["kyc.manage", "workflow.submit"])(req, {}, next);

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("one of");
  });
});
