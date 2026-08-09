const request = require("supertest");

jest.mock("express-mongo-sanitize", () => () => (req, res, next) => next());
jest.mock("xss-clean", () => () => (req, res, next) => next());
jest.mock("../../src/models/publicFormToken.model", () => ({
  findOne: jest.fn(),
}));

const PublicFormToken = require("../../src/models/publicFormToken.model");

const app = require("../../src/app");

describe("platform route guards and public routes", () => {
  it("requires auth for tenants route", async () => {
    const response = await request(app).get("/api/v1/tenants");
    expect(response.statusCode).toBe(401);
  });

  it("requires auth for workflows route", async () => {
    const response = await request(app).get("/api/v1/workflows");
    expect(response.statusCode).toBe(401);
  });

  it("requires auth for audit logs route", async () => {
    const response = await request(app).get("/api/v1/audit/logs");
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for invalid public form token", async () => {
    PublicFormToken.findOne.mockResolvedValue(null);
    const response = await request(app).get("/api/v1/public/form/invalid-token");
    expect(response.statusCode).toBe(404);
  });
});
