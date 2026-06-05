// Minimal standalone ESLint config for @maiyuri/shared.
// Uses ONLY ESLint built-in rules — no @eslint/js, typescript-eslint, or globals
// needed (those live in the monorepo root, not in this package's node_modules).
export default [
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
    },
  },
];
