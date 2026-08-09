const request = require("supertest");

jest.mock("express-mongo-sanitize", () => () => (req, res, next) => next());
jest.mock("xss-clean", () => () => (req, res, next) => next());

jest.mock("../../src/modules/auth/auth.service", () => ({
  login: jest.fn(),
  verifyOtp: jest.fn(),
  setPassword: jest.fn(),
  inviteUser: jest.fn(),
}));

jest.mock("../../src/middlewares/auth.middleware", () =>
  jest.fn((req, res, next) => {
    req.auth = { tenantId: "tenant-1", permissionCodes: ["user.invite"] };
    next();
  })
);

const authService = require("../../src/modules/auth/auth.service");
const app = require("../../src/app");

describe("API routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /api/v1/health returns healthy status", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "pink-api" });
  });

  it("POST /api/v1/auth/login returns 422 for invalid email", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "bad-email",
      password: "StrongPass123!",
    });

    expect(response.statusCode).toBe(422);
    expect(response.body.message).toBe("Validation failed");
  });

  it("POST /api/v1/auth/login returns 200 for valid payload", async () => {
    authService.login.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "u-1" },
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: "john@test.com",
      password: "StrongPass123!",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.accessToken).toBe("access-token");
  });

  it("POST /api/v1/auth/verify-otp validates OTP length", async () => {
    const response = await request(app).post("/api/v1/auth/verify-otp").send({
      inviteToken: "abc",
      otpCode: "12345",
    });

    expect(response.statusCode).toBe(422);
    expect(response.body.message).toBe("Validation failed");
  });

  it("POST /api/v1/auth/set-password validates minimum password length", async () => {
    const response = await request(app).post("/api/v1/auth/set-password").send({
      inviteToken: "abc",
      password: "short",
    });

    expect(response.statusCode).toBe(422);
    expect(response.body.message).toBe("Validation failed");
  });

  it("returns 404 on unknown route", async () => {
    const response = await request(app).get("/api/v1/not-found");
    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe("Route not found");
  });
});
