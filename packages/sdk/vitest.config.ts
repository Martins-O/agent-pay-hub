import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      reporter: ['text', 'html'],
      enabled: false
    }
  },
  resolve: {
    alias: {
      '@agentpay/types': join(rootDir, '..', 'types', 'src', 'index.ts')
    }
  }
});
