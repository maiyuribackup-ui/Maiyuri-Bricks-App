// Minimal standalone ESLint config for @maiyuri/ui.
// Uses ONLY ESLint built-in rules — no @eslint/js, typescript-eslint, or globals
// needed (those live in the monorepo root, not in this package's node_modules).
// TypeScript checking is handled by `tsc --noEmit`; this just catches JS basics.
export default [
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off', // TypeScript handles this
    },
  },
];
