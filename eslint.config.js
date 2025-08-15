import js from '@eslint/js';
import ts from 'typescript-eslint';
import pluginImport from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
  // Global ignores to reduce noise
  { ignores: ['dist/**', '*.cjs', 'docs/**', 'openapi.yaml', '.eslintrc.cjs', 'prettier.config.cjs', 'eslint.config.js'] },

  // Base recommended configs
  ...ts.configs.recommended,

  // Project rules only for TS files
  {
    files: ['**/*.ts'],
    plugins: { import: pluginImport },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }],
      'import/order': ['warn', { 'newlines-between': 'always' }],
      'no-prototype-builtins': 'error'
    },
    languageOptions: {
      parser: ts.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        module: 'readonly',
        fetch: 'readonly'
      }
    }
  },

  prettier
];