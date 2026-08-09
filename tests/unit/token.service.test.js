const jwt = require("jsonwebtoken");
const tokenService = require("../../src/services/token.service");

jest.mock("jsonwebtoken");

describe("token.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("signAccessToken uses access secret and expiry", () => {
    jwt.sign.mockReturnValue("access-token");

    const token = tokenService.signAccessToken({ userId: "u-1" });

    expect(token).toBe("access-token");
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: "u-1" },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN }
    );
  });

  it("signRefreshToken uses refresh secret and expiry", () => {
    jwt.sign.mockReturnValue("refresh-token");

    const token = tokenService.signRefreshToken({ userId: "u-1" });

    expect(token).toBe("refresh-token");
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: "u-1" },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );
  });
});
