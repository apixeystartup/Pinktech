const controller = require("../../services/auth-service/src/routes/auth.controller");
const authService = require("../../services/auth-service/src/services/auth.service");

jest.mock("../../services/auth-service/src/services/auth.service");

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("auth.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("login returns 200 with service response", async () => {
    const req = { body: { email: "john@test.com", password: "StrongPass123!" } };
    const res = createRes();
    const next = jest.fn();
    authService.login.mockResolvedValue({ accessToken: "token" });

    await controller.login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ accessToken: "token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("inviteUser returns 201 with service response", async () => {
    const req = { body: { email: "alice@test.com", name: "Alice", tenantId: "t1" } };
    const res = createRes();
    const next = jest.fn();
    authService.inviteUser.mockResolvedValue({ userId: "u-1" });

    await controller.inviteUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ userId: "u-1" });
    expect(authService.inviteUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", email: "alice@test.com" }),
    );
  });

  it("inviteUser merges req.tenantId when body omits tenantId", async () => {
    const req = { body: { email: "bob@test.com", name: "Bob" }, tenantId: "t-ctx" };
    const res = createRes();
    const next = jest.fn();
    authService.inviteUser.mockResolvedValue({ userId: "u-2" });

    await controller.inviteUser(req, res, next);

    expect(authService.inviteUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t-ctx" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invite without tenant context", async () => {
    const next = jest.fn();

    await controller.inviteUser({ body: { email: "missing@example.com" } }, createRes(), next);

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it("forwards verify, set-password and login errors", async () => {
    const error = new Error("service failure");
    const next = jest.fn();
    authService.login.mockRejectedValue(error);
    authService.verifyOtp.mockRejectedValue(error);
    authService.setPassword.mockRejectedValue(error);

    await controller.login({ body: {} }, createRes(), next);
    await controller.verifyOtp({ body: {} }, createRes(), next);
    await controller.setPassword({ body: {} }, createRes(), next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("returns the authenticated session profile", async () => {
    const res = createRes();
    authService.getSessionProfile.mockResolvedValue({ userId: "u1", name: "Alice" });

    await controller.me({ auth: { userId: "u1", permissionCodes: ["user.view"] } }, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      userId: "u1",
      name: "Alice",
      permissionCodes: ["user.view"],
    });
  });

  it("verifyOtp forwards errors to next", async () => {
    const req = { body: { inviteToken: "x", otpCode: "123456" } };
    const res = createRes();
    const next = jest.fn();
    const error = new Error("bad otp");
    authService.verifyOtp.mockRejectedValue(error);

    await controller.verifyOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("refresh, resend invite, forgot and reset route to service", async () => {
    const res = createRes();
    const next = jest.fn();

    authService.refresh.mockResolvedValue({ accessToken: "a", refreshToken: "r" });
    authService.resendInvite.mockResolvedValue({ message: "ok" });
    authService.forgotPassword.mockResolvedValue({ message: "ok" });
    authService.resetPassword.mockResolvedValue({ message: "ok" });

    await controller.refresh({ body: { refreshToken: "r" } }, res, next);
    await controller.resendInvite({ body: { tenantId: "t1", email: "a@b.com" } }, res, next);
    await controller.forgotPassword({ body: { email: "a@b.com" } }, res, next);
    await controller.resetPassword({ body: { resetToken: "x", password: "StrongPass123!" } }, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards service errors from refresh path", async () => {
    const res = createRes();
    const next = jest.fn();
    const error = new Error("refresh failed");
    authService.refresh.mockRejectedValue(error);
    await controller.refresh({ body: { refreshToken: "bad" } }, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
