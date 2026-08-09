const sanitizeMiddleware = require("../../src/middlewares/sanitize.middleware");
const hierarchyMiddleware = require("../../src/middlewares/hierarchy.middleware");
const upload = require("../../src/middlewares/upload.middleware");
const hierarchyService = require("../../src/modules/positions/hierarchy.service");

jest.mock("../../src/modules/positions/hierarchy.service");

describe("extra middlewares", () => {
  it("sanitizes body params and query values", () => {
    const req = {
      body: { "<bad>": "x", name: "<script>" },
      params: { id: "1" },
      query: { q: "<x>", "$where": "bad" },
    };
    const next = jest.fn();
    sanitizeMiddleware(req, {}, next);
    expect(req.body.name).toBe("script");
    expect(req.query.q).toBe("x");
    expect(req.query.$where).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("hierarchy middleware rejects out-of-subtree target", async () => {
    hierarchyService.getSubtreePositionIds.mockResolvedValue(["p1", "p2"]);
    const req = {
      auth: { positionId: "p1" },
      tenantId: "t1",
      params: { positionId: "p9" },
      body: {},
      query: {},
    };
    const next = jest.fn();
    await hierarchyMiddleware()(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it("upload middleware exposes multer handlers", () => {
    expect(typeof upload.single).toBe("function");
    const cb = jest.fn();
    upload._fileFilter({}, { mimetype: "image/png" }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
    const cbBad = jest.fn();
    upload._fileFilter({}, { mimetype: "text/plain" }, cbBad);
    expect(cbBad.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
