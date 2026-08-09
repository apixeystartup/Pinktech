const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authService = require("../../src/modules/auth/auth.service");
const ApiError = require("../../src/common/errors/ApiError");
const User = require("../../src/models/user.model");
const Tenant = require("../../src/models/tenant.model");
const RefreshToken = require("../../src/models/refreshToken.model");
const tokenService = require("../../src/services/token.service");
const auditService = require("../../src/services/audit.service");
const notificationAdapter = require("../../src/modules/notifications/notification.adapter");

jest.mock("bcrypt");
jest.mock("jsonwebtoken");
jest.mock("../../src/models/user.model");
jest.mock("../../src/models/tenant.model");
jest.mock("../../src/models/refreshToken.model");
jest.mock("../../src/services/token.service");
jest.mock("../../src/services/audit.service");
jest.mock("../../src/modules/notifications/notification.adapter");

describe("auth.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(userDoc),
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
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        authService.login({ email: "missing@test.com", password: "test12345" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 401 }));
    });

    it("throws 403 when account not active", async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          tenantId: "tenant-1",
          status: "OTP_PENDING",
        }),
      });
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE" });

      await expect(
        authService.login({ email: "x@test.com", password: "test12345" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 403 }));
    });

    it("throws 401 on invalid password", async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: "u-1",
          tenantId: "tenant-1",
          status: "ACTIVE",
          passwordHash: "hash",
          save: jest.fn().mockResolvedValue(undefined),
        }),
      });
      bcrypt.compare.mockResolvedValue(false);
      Tenant.findById.mockResolvedValue({ _id: "tenant-1", status: "ACTIVE" });

      await expect(
        authService.login({ email: "x@test.com", password: "bad-pass" })
      ).rejects.toEqual(expect.objectContaining({ statusCode: 401 }));
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
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
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

    it("handles forgot password existing user", async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({ email: "a@b.com", save }),
      });
      notificationAdapter.sendEmail.mockResolvedValue(undefined);

      const result = await authService.forgotPassword({ email: "a@b.com" });
      expect(result.message).toContain("reset email");
      expect(save).toHaveBeenCalled();
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
