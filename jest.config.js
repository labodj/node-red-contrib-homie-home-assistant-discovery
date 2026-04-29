module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 75,
      functions: 95,
      lines: 90,
    },
  },
};
