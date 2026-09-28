/* global __dirname */
/**
 * Jest config for the paid E2E runs only (assist.e2e.ts). Not the app preset:
 * jest-expo replaces fetch with a stub, and these runs need the real network.
 * Run from the repository root:
 *   NODE_USE_ENV_PROXY=1 npx jest -c server/scripts/jev-router/jest.e2e.config.cjs
 */
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

module.exports = {
  rootDir: root,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/server/scripts/jev-router/assist.e2e.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 900000,
};
