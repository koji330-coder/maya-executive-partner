// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // server/.wrangler holds the Worker bundle wrangler builds on every dev
    // reload. Linting generated code reported a hundred errors nobody wrote.
    ignores: [
      'dist/*',
      'coverage/*',
      '.expo/*',
      'node_modules/*',
      'server/node_modules/*',
      'server/.wrangler/*',
    ],
  },
]);
