/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  // The suite covers the refresh coordinator, which is plain TypeScript over
  // axios — no DOM, so no jsdom. Components are deliberately untested: the
  // project's test policy is that suite size is part of the signal.
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@tally/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // The app's tsconfig targets the bundler (`module: esnext`); Jest runs on
    // CommonJS, so the tests compile with that one setting overridden.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react-jsx' } }],
  },
};
