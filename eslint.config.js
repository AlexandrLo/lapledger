import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'temp', 'tests/fixtures/motec'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The installed eslint-plugin-react-hooks exposes a ready-made flat config
  // object under `configs.flat['recommended-latest']`, so it is used directly
  // instead of spreading `configs.recommended.rules` into the block below.
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['tests/**/*.ts', 'src/**/__tests__/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
