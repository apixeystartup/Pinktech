const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authService = require("../../services/auth-service/src/services/auth.service");
const usersService = require("../../services/auth-service/src/services/users.service");
const ApiError = require("@pink/shared").ApiError;
const User = require("../../services/auth-service/src/models/user.model");
const Tenant = require("../../services/auth-service/src/models/tenant.model");
const Notification = require("../../services/auth-service/src/models/notification.model");
const Role = require("../../services/auth-service/src/models/role.model");
const RefreshToken = require("../../services/auth-service/src/models/refreshToken.model");
const tokenService = require("../../services/auth-service/src/services/token.service");
const auditService = require("../../services/auth-service/src/services/audit.service");
const notificationAdapter = require("@pink/shared").notificationAdapter;

jest.mock("bcrypt");
jest.mock("jsonwebtoken");
jest.mock("../../services/auth-service/src/models/user.model");
jest.mock("../../services/auth-service/src/models/tenant.model");
jest.mock("../../services/auth-service/src/models/notification.model");
jest.mock("../../services/auth-service/src/models/role.model");
jest.mock("../../services/auth-service/src/models/refreshToken.model");
jest.mock("../../services/auth-service/src/services/token.service");
jest.mock("../../services/auth-service/src/services/audit.service");
jest.mock("@pink/shared", () => ({
  ...jest.requireActual("@pink/shared"),
  notificationAdapter: { sendEmail: jest.fn().mockResolvedValue({ ok: true }) },
}));

describe("auth.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Role.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
  });

  describe("login", () => {
    it("returns tokens and user on valid credentials", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const userDoc = {
        _id: "user-1",
        tenantId: "tenant-1",
        roleIds: ["role-1"],
        currentPositionId: "position-1",
        name: "John",
        email: "john@test.com",
        passwordHash: "hashed",
        status: "ACTIVE",
        save,
      };
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([userDoc]),
      });
      bcrypt.compare.mockResolvedValue(true);
      tokenService.signAccessToken.mockReturnValue("access-token");
      tokenService.signRefreshToken.mockReturnValue("refresh-token");
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE", name: "Acme Co", code: "ACME" });
      RefreshToken.create.mockResolvedValue({ _id: "rt-1" });

      const result = await authService.login({
        email: "john@test.com",
        password: "StrongPass123!",
      });

      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
      expect(result.user.email).toBe("john@test.com");
      expect(result.tenant).toEqual(
        expect.objectContaining({ _id: "tenant-1", name: "Acme Co", code: "ACME", status: "ACTIVE" }),
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(auditService.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "AUTH_LOGIN" })
      );
    });

    it("throws 401 when user not found", async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      await expect(
        authService.login({ email: "missing@test.com", password: "test12345" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 401 }));
    });

    it("throws 403 when account not active", async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            tenantId: "tenant-1",
            status: "OTP_PENDING",
          },
        ]),
      });
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE" });

      await expect(
        authService.login({ email: "x@test.com", password: "test12345" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 403 }));
    });

    it("throws 401 on invalid password", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "u-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            passwordHash: "hash",
            loginAttempts: 2,
            save,
          },
        ]),
      });
      bcrypt.compare.mockResolvedValue(false);
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE" });

      await expect(authService.login({ email: "x@test.com", password: "bad-pass" })).rejects.toEqual(
        expect.objectContaining({ statusCode: 401, details: { remainingAttempts: 2 } }),
      );
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("locks the account after the fifth failed attempt and returns its expiry", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const user = {
        _id: "u-1",
        tenantId: "tenant-1",
        status: "ACTIVE",
        passwordHash: "hash",
        loginAttempts: 4,
        save,
      };
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([user]) });
      bcrypt.compare.mockResolvedValue(false);
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE" });

      const beforeAttempt = Date.now();
      await expect(authService.login({ email: "x@test.com", password: "bad-pass" })).rejects.toEqual(
        expect.objectContaining({
          statusCode: 423,
          details: expect.objectContaining({
            unlockAt: expect.any(Date),
            remainingSeconds: 15 * 60,
          }),
        }),
      );

      expect(user.status).toBe("LOCKED");
      expect(user.lockUntil.getTime()).toBeGreaterThanOrEqual(beforeAttempt + 15 * 60 * 1000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("clears an expired lock before accepting valid credentials", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const user = {
        _id: "u-1",
        tenantId: "tenant-1",
        roleIds: [],
        status: "LOCKED",
        passwordHash: "hash",
        loginAttempts: 5,
        lockUntil: new Date(Date.now() - 1000),
        save,
      };
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([user]) });
      bcrypt.compare.mockResolvedValue(true);
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE", name: "Acme", code: "ACME" });
      tokenService.signAccessToken.mockReturnValue("access-token");
      tokenService.signRefreshToken.mockReturnValue("refresh-token");
      RefreshToken.create.mockResolvedValue({ _id: "rt-1" });

      const result = await authService.login({ email: "x@test.com", password: "valid-pass" });

      expect(result.accessToken).toBe("access-token");
      expect(user.status).toBe("ACTIVE");
      expect(user.loginAttempts).toBe(0);
      expect(user.lockUntil).toBeNull();
      expect(save).toHaveBeenCalledTimes(2);
    });

    it("logs into the tenant whose password matches when the email exists in several tenants", async () => {
      const saveA = jest.fn().mockResolvedValue(undefined);
      const saveB = jest.fn().mockResolvedValue(undefined);
      const userA = {
        _id: "user-a",
        tenantId: "tenant-a",
        roleIds: [],
        name: "A",
        email: "dup@test.com",
        passwordHash: "hash-a",
        status: "ACTIVE",
        save: saveA,
      };
      const userB = {
        _id: "user-b",
        tenantId: "tenant-b",
        roleIds: [],
        name: "B",
        email: "dup@test.com",
        passwordHash: "hash-b",
        status: "ACTIVE",
        save: saveB,
      };
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([userA, userB]) });
      Tenant.findById.mockImplementation((id) =>
        Promise.resolve({ _id: id, status: "ACTIVE", name: `Tenant ${id}`, code: String(id).toUpperCase() })
      );
      bcrypt.compare.mockImplementation((pw, hash) => Promise.resolve(hash === "hash-b" && pw === "pass-b"));
      tokenService.signAccessToken.mockReturnValue("access-b");
      tokenService.signRefreshToken.mockReturnValue("refresh-b");
      RefreshToken.create.mockResolvedValue({ _id: "rt-b" });

      const result = await authService.login({ email: "dup@test.com", password: "pass-b" });

      expect(result.user.id).toBe("user-b");
      expect(result.tenant._id).toBe("tenant-b");
      expect(saveB).toHaveBeenCalledTimes(1);
      expect(saveA).not.toHaveBeenCalled();
    });
  });

  describe("inviteUser", () => {
    it("creates/upserts user in OTP_PENDING and returns invite payload", async () => {
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "tenant-1", status: "ACTIVE", name: "Acme" }),
      });
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });
      User.findOneAndUpdate.mockResolvedValue({
        _id: "user-123",
        email: "alice@test.com",
        orgContactEmail: null,
      });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      const result = await authService.inviteUser({
        tenantId: "tenant-1",
        name: "Alice",
        email: "alice@test.com",
        roleIds: ["role-1"],
      });

      expect(result.userId).toBe("user-123");
      expect(result.inviteToken).toHaveLength(64);
      expect(result.otpCode).toMatch(/^\d{6}$/);
      expect(auditService.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "USER_INVITED" })
      );
      expect(notificationAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "alice@test.com" })
      );
    });

    it("matches org roster by official email, promotes synthetic login, and mails the official address", async () => {
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "tenant-1", status: "ACTIVE", name: "Acme" }),
      });
      const rosterUser = {
        _id: "roster-1",
        email: "le.r5.tabcd@org-sheet.pink",
        orgContactEmail: "official@test.com",
        empCode: "LE1",
      };
      User.findOne.mockImplementation((filter) => {
        if (filter.$or) {
          return { select: jest.fn().mockResolvedValue(rosterUser) };
        }
        if (filter.email && filter._id && filter.tenantId) {
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue(null) };
      });
      User.findByIdAndUpdate.mockResolvedValue({
        _id: "roster-1",
        email: "official@test.com",
        orgContactEmail: "official@test.com",
      });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      await authService.inviteUser({
        tenantId: "tenant-1",
        name: "Pat",
        email: "official@test.com",
        roleIds: ["role-1"],
      });

      expect(User.findByIdAndUpdate).toHaveBeenCalled();
      expect(notificationAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "official@test.com",
        })
      );
    });

    it("puts org roster email in invite HTML when login email is still an older real address", async () => {
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "tenant-1", status: "ACTIVE", name: "Pinktech" }),
      });
      const rosterUser = {
        _id: "u-1",
        email: "apixeymagic@gmail.com",
        orgContactEmail: "updated-from-sheet@company.com",
        empCode: "E1",
      };
      User.findOne.mockImplementation((filter) => {
        if (filter.$or) {
          return { select: jest.fn().mockResolvedValue(rosterUser) };
        }
        if (filter.email && filter._id && filter.tenantId) {
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue(null) };
      });
      User.findByIdAndUpdate.mockResolvedValue({
        _id: "u-1",
        email: "apixeymagic@gmail.com",
        orgContactEmail: "updated-from-sheet@company.com",
      });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      await authService.inviteUser({
        tenantId: "tenant-1",
        name: "Pat",
        email: "updated-from-sheet@company.com",
        roleIds: ["role-1"],
      });

      expect(notificationAdapter.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "updated-from-sheet@company.com",
          html: expect.stringContaining("updated-from-sheet@company.com"),
        }),
      );
      expect(notificationAdapter.sendEmail.mock.calls[0][0].html).not.toContain("apixeymagic@gmail.com");
    });
  });

  describe("verifyOtp", () => {
    it("verifies OTP and persists user", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const userDoc = {
        tenantId: "tenant-1",
        email: "a@test.com",
        inviteExpiry: new Date(Date.now() + 60_000),
        otpExpiry: new Date(Date.now() + 60_000),
        otpCode: "123456",
        otpVerified: false,
        save,
      };
      User.findOne.mockImplementation((q) => {
        if (q.inviteToken) {
          return { select: jest.fn().mockResolvedValue(userDoc) };
        }
        return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) };
      });
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ name: "Acme" }),
      });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      const result = await authService.verifyOtp({
        inviteToken: "invite-token",
        otpCode: "123456",
      });

      expect(result.message).toContain("OTP verified");
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("throws when invite token is invalid", async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        authService.verifyOtp({ inviteToken: "bad", otpCode: "123456" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }));
    });

    it("throws when OTP mismatches", async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          inviteExpiry: new Date(Date.now() + 60_000),
          otpExpiry: new Date(Date.now() + 60_000),
          otpCode: "654321",
          save: jest.fn(),
        }),
      });

      await expect(
        authService.verifyOtp({ inviteToken: "good", otpCode: "123456" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe("setPassword", () => {
    it("sets password and activates account after OTP verification", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: "user-1",
          tenantId: "tenant-1",
          otpVerified: true,
          inviteExpiry: new Date(Date.now() + 60_000),
          save,
        }),
      });
      bcrypt.hash.mockResolvedValue("new-hash");

      const result = await authService.setPassword({
        inviteToken: "invite",
        password: "StrongPass123!",
      });

      expect(result).toEqual({ message: "Password set successfully" });
      expect(save).toHaveBeenCalledTimes(1);
      expect(auditService.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "AUTH_PASSWORD_SET" })
      );
    });

    it("sets password using email and invitation code", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: "user-1",
          tenantId: "tenant-1",
          otpVerified: true,
          save,
        }),
      });
      bcrypt.hash.mockResolvedValue("new-hash");

      const result = await authService.setPassword({
        email: "a@test.com",
        invitationCode: "ABCD1234",
        password: "StrongPass123!",
      });

      expect(result.message).toContain("Password set");
      expect(save).toHaveBeenCalled();
    });

    it("throws when OTP is not verified", async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          otpVerified: false,
          inviteExpiry: new Date(Date.now() + 60_000),
        }),
      });

      await expect(
        authService.setPassword({ inviteToken: "invite", password: "12345678" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 400 }));
    });
  });

  it("uses ApiError class in failures", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });

    try {
      await authService.login({ email: "none@test.com", password: "12345678" });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
    }
  });

  describe("refresh", () => {
    it("rotates refresh token", async () => {
      jwt.verify.mockReturnValue({ userId: "u1" });
      RefreshToken.findOne.mockResolvedValue({ revokedAt: null, save: jest.fn().mockResolvedValue(undefined) });
      User.findById.mockResolvedValue({
        _id: "u1",
        tenantId: "t1",
        roleIds: ["r1"],
        currentPositionId: "p1",
        status: "ACTIVE",
      });
      tokenService.signAccessToken.mockReturnValue("new-access");
      tokenService.signRefreshToken.mockReturnValue("new-refresh");
      RefreshToken.create.mockResolvedValue({ _id: "rt2" });

      const result = await authService.refresh({ refreshToken: "old-refresh" });
      expect(result.accessToken).toBe("new-access");
      expect(result.refreshToken).toBe("new-refresh");
    });
  });

  describe("resend/forgot/reset", () => {
    it("resends invite for existing user", async () => {
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "t1", status: "ACTIVE", name: "Acme" }),
      });
      const invitedUser = {
        _id: "u1",
        name: "A",
        email: "a@b.com",
        orgContactEmail: null,
        roleIds: ["r1"],
        currentPositionId: "p1",
      };
      User.findOne.mockImplementation((filter) => {
        if (filter.$or) {
          return { select: jest.fn().mockResolvedValue(invitedUser) };
        }
        if (filter.email && filter._id && filter._id.$ne) {
          return {
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          };
        }
        return { select: jest.fn().mockResolvedValue(null) };
      });
      User.findByIdAndUpdate.mockResolvedValue({ ...invitedUser, email: "a@b.com" });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      const result = await authService.resendInvite({ tenantId: "t1", email: "a@b.com" });
      expect(result.message).toBe("Invite resent");
    });

    it("notifies the matching tenant admin for a password reset request", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const employee = {
        _id: "employee-1",
        tenantId: "tenant-1",
        name: "Alice",
        email: "alice@org-sheet.pink",
        orgContactEmail: "a@b.com",
        empCode: "E-14",
        save,
      };
      const admin = { _id: "admin-1", name: "Tenant admin", email: "admin@b.com" };
      User.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([employee]),
      });
      Tenant.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "tenant-1", adminUserId: "admin-1" }),
      });
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(admin) }),
      });

      const result = await authService.forgotPassword({ email: "a@b.com" });
      expect(result.message).toContain("organization administrator");
      expect(save).toHaveBeenCalled();
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          recipientUserId: "admin-1",
          eventType: "PASSWORD_RESET_REQUEST",
          message: expect.stringContaining("email: a@b.com"),
          metadata: expect.objectContaining({ employeeId: "E-14", employeeEmail: "a@b.com" }),
        }),
      );
      expect(notificationAdapter.sendEmail).not.toHaveBeenCalled();
    });

    it("returns not found when a password reset email has no account", async () => {
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });

      await expect(authService.forgotPassword({ email: "missing@b.com" })).rejects.toEqual(
        expect.objectContaining({ statusCode: 404 }),
      );
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it("notifies each tenant when the same email is registered more than once", async () => {
      const users = [
        { _id: "employee-1", tenantId: "tenant-1", email: "shared@b.com", save: jest.fn() },
        { _id: "employee-2", tenantId: "tenant-2", email: "shared@b.com", save: jest.fn() },
      ];
      User.find.mockReturnValue({ select: jest.fn().mockResolvedValue(users) });
      Tenant.findById
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "tenant-1", adminUserId: "admin-1" }) })
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "tenant-2", adminUserId: "admin-2" }) });
      User.findById
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "admin-1" }) }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "admin-2" }) }),
        });

      await authService.forgotPassword({ email: "shared@b.com" });

      expect(Notification.create).toHaveBeenCalledTimes(2);
      expect(Notification.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenantId: "tenant-1", recipientUserId: "admin-1" }),
      );
      expect(Notification.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: "tenant-2", recipientUserId: "admin-2" }),
      );
    });

    it("allows an administrator to unlock an employee and reset failed attempts", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const user = {
        _id: "employee-1",
        email: "employee@b.com",
        status: "LOCKED",
        loginAttempts: 5,
        lockUntil: new Date(),
        save,
      };
      User.findOne.mockResolvedValue(user);

      const result = await usersService.unlockAccount("tenant-1", "employee-1", {
        userId: "admin-1",
        isAdmin: true,
      });

      expect(result).toEqual({ _id: "employee-1", status: "ACTIVE", lockUntil: null });
      expect(user.loginAttempts).toBe(0);
      expect(user.lockUntil).toBeNull();
      expect(save).toHaveBeenCalledTimes(1);
      expect(auditService.writeAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "USER_ACCOUNT_UNLOCKED" }),
      );
    });

    it("resets password and revokes old refresh tokens", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: "u1",
          tenantId: "t1",
          resetExpiry: new Date(Date.now() + 60000),
          save,
        }),
      });
      bcrypt.hash.mockResolvedValue("h");
      RefreshToken.updateMany.mockResolvedValue({});

      const result = await authService.resetPassword({ resetToken: "x", password: "StrongPass123!" });
      expect(result.message).toContain("reset");
      expect(save).toHaveBeenCalled();
    });
  });
});
