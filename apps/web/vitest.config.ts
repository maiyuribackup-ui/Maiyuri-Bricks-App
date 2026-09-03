import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    // Playwright owns the entire tests/ dir (e2e specs + helper tests that call
    // test.describe from @playwright/test). Keep Vitest out of it, or Playwright
    // throws "test.describe() was not expected here" when Vitest collects them.
    // Run Playwright via `npm run test:e2e` instead.
    exclude: [...configDefaults.exclude, 'tests/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@maiyuri/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@maiyuri/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
