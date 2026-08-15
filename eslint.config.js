import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.pnpm-store', 'temp', 'tests/fixtures/motec'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      perfectionist,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/max-len': [
        'error', { 
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      'perfectionist/sort-imports': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          internalPattern: ['^@core/.+', '^@app/.+', '^@worker/.+', '^@tests/.+'],
          newlinesBetween: 1,
        },
      ],
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['..', '../*', '../**'],
              message:
                'Reach outside the directory through @core, @app, @worker or @tests, not "..".',
            },
            {
              group: ['./*/*', './*/**'],
              message:
                'Relative imports may go one level deep. Use @core, @app, @worker or @tests ' +
                'for anything deeper.',
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
);