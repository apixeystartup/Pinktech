const { orgAdminMiddleware, superAdminMiddleware } = require("../../services/org-service/src/middlewares/orgAdmin.middleware");

describe("orgAdminMiddleware (day-to-day org writes: people, imports, reload)", () => {
  const call = (auth) => {
    const next = jest.fn();
    orgAdminMiddleware({ auth }, {}, next);
    return next;
  };

  it("lets the platform super admin write", () => {
    expect(call({ isSuperAdmin: true, accountRole: "super_admin" })).toHaveBeenCalledWith();
  });

  it("lets a tenant admin onboard its own organization", () => {
    expect(call({ isSuperAdmin: false, accountRole: "tenant_admin" })).toHaveBeenCalledWith();
  });

  it("rejects an ordinary employee", () => {
    const error = call({ isSuperAdmin: false, accountRole: "employee" }).mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("org admin");
  });
});

describe("superAdminMiddleware (platform-wide sweeps: reset, rollback, roles)", () => {
  const call = (auth) => {
    const next = jest.fn();
    superAdminMiddleware({ auth }, {}, next);
    return next;
  };

  it("lets the platform super admin through", () => {
    expect(call({ isSuperAdmin: true, accountRole: "super_admin" })).toHaveBeenCalledWith();
  });

  it("rejects a tenant admin", () => {
    const error = call({ isSuperAdmin: false, accountRole: "tenant_admin" }).mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("platform super admin");
  });
});

describe("postEmployee tenant isolation", () => {
  jest.mock("../../services/org-service/src/services/orgMutations.service", () => ({
    addEmployee: jest.fn(async (tenantId) => ({ _id: "emp-1", tenantId })),
  }));

  // eslint-disable-next-line global-require
  const controller = require("../../services/org-service/src/services/orgExplorer.controller");
  // eslint-disable-next-line global-require
  const orgMutations = require("../../services/org-service/src/services/orgMutations.service");

  const run = async (body, tenantId, auth) => {
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.postEmployee({ body, tenantId, auth }, res, next);
    return { next, res };
  };

  beforeEach(() => orgMutations.addEmployee.mockClear());

  it("creates a person in the caller's own tenant", async () => {
    const { next, res } = await run({ name: "Ada" }, "tenant-own", { isSuperAdmin: false, accountRole: "tenant_admin" });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(orgMutations.addEmployee).toHaveBeenCalledWith("tenant-own", { name: "Ada" }, expect.anything());
  });

  it("blocks a tenant admin from naming another tenant", async () => {
    const { next } = await run({ tenant_id: "tenant-other", name: "Ada" }, "tenant-own", {
      isSuperAdmin: false,
      accountRole: "tenant_admin",
    });

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("their own organization");
    expect(orgMutations.addEmployee).not.toHaveBeenCalled();
  });

  it("still lets the super admin target a tenant from the Home roll-up", async () => {
    const { next, res } = await run({ tenant_id: "tenant-other", name: "Ada" }, "tenant-own", {
      isSuperAdmin: true,
      accountRole: "super_admin",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(orgMutations.addEmployee).toHaveBeenCalledWith("tenant-other", { name: "Ada" }, expect.anything());
  });
});
