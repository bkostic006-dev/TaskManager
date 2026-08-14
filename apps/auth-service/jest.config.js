/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\.(spec|e2e-spec)\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Resolve the shared package from source so the suite never depends on
  // `@tally/contracts` having been built first.
  moduleNameMapper: {
    '^@tally/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
};
