const accountAdminMiddleware = require("../../services/auth-service/src/middlewares/accountAdmin.middleware");

describe("account admin middleware", () => {
  it.each([
    [{ isSuperAdmin: true, accountRole: "super_admin" }],
    [{ isSuperAdmin: false, accountRole: "tenant_admin" }],
  ])("allows administrative accounts", (auth) => {
    const next = jest.fn();
    accountAdminMiddleware({ auth }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("denies employee accounts", () => {
    const next = jest.fn();
    accountAdminMiddleware({ auth: { isSuperAdmin: false, accountRole: "employee" } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
