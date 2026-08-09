module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/server.js",
    "!src/docs/**",
    "!src/jobs/**",
    "!src/scripts/**",
  ],
  setupFiles: ["<rootDir>/tests/setup/env.js"],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
