import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['node_modules', 'dist', 'coverage']),
  {
    files: ['**/*.js'],
    plugins: {
      prettier,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      ...configPrettier.rules,
    },
  },
]);
