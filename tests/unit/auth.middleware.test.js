const serviceAuth = require("../../services/org-service/src/middlewares/serviceAuth");

describe("serviceAuth middleware", () => {
  it("rejects requests without gateway auth context", () => {
    const next = jest.fn();

    serviceAuth({ headers: {} }, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("maps gateway headers into request auth context", () => {
    const req = {
      headers: {
        "x-auth-user-id": "user-1",
        "x-auth-tenant-id": "tenant-1",
        "x-auth-base-tenant-id": "base-tenant",
        "x-auth-permission-codes": '["tenant.manage"]',
      },
    };
    const next = jest.fn();

    serviceAuth(req, {}, next);

    expect(req.tenantId).toBe("tenant-1");
    expect(req.auth).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      baseTenantId: "base-tenant",
      actingAsTenantId: "tenant-1",
      permissionCodes: ["tenant.manage"],
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("uses an empty permission list for malformed permission headers", () => {
    const req = {
      headers: {
        "x-auth-user-id": "user-1",
        "x-auth-tenant-id": "tenant-1",
        "x-auth-permission-codes": "invalid-json",
      },
    };
    const next = jest.fn();

    serviceAuth(req, {}, next);

    expect(req.auth.permissionCodes).toEqual([]);
    expect(next).toHaveBeenCalledWith();
  });
});
