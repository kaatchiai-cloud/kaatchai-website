import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['infra/**/*.ts'],
    extends: [eslintJs.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'build/',
      'node_modules/',
      'vendor/',
      'marketing-pipeline/',
      'app/',
      'js/',
      'website/',
      'mocks/',
      'audio/',
    ],
  },
);
