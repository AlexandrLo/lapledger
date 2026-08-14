import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.pnpm-store', 'temp', 'tests/fixtures/motec'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The installed eslint-plugin-react-hooks exposes a ready-made flat
      // config object under `configs.flat['recommended-latest']`; its rules
      // are spread here (rather than used as a standalone array entry) so
      // the rule set stays scoped to `.ts`/`.tsx` files instead of applying
      // react-hooks rules to every file ESLint touches.
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['..', '../*', '../**'],
              message:
                'Reach outside the directory through @core, @app or @tests, not through "..".',
            },
            {
              group: ['./*/*', './*/**'],
              message:
                'Relative imports may go one level deep. Use @core, @app or @tests for anything deeper.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'src/**/__tests__/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
