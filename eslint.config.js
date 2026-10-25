import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'data/', 'assets-src/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  { files: ['src/**', 'vite.config.js'], languageOptions: { globals: globals.browser } },
  { files: ['server/**', 'scripts/**', 'deploy/**', 'test/**', 'vite.config.js'], languageOptions: { globals: globals.node } },
  { files: ['shared/**'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
];
