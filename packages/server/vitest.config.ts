import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts']
    },
    include: ['test/**/*.{test,spec}.ts'],
    globals: true,
    setupFiles: ['test/setup/env.ts']
  }
});
