/** @type {import('ts-jest').JestConfigWithTsJest} */

// eslint-disable-next-line no-undef
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/e2e/**/*.test.ts", "**/tests/unit/**/*.test.ts"],
  verbose: true,
  clearMocks: true,
  resetMocks: false,
  testTimeout: 30000,
  modulePathIgnorePatterns: ["<rootDir>/tests/fixtures", "<rootDir>/tmp-test"],
  globalSetup: "<rootDir>/tests/e2e/global-setup.ts",
  setupFilesAfterEnv: ["./tests/setup.ts"],
};
