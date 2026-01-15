import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
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
