import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@sprigscope/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@sprigscope/rp2040': fileURLToPath(new URL('../../packages/rp2040/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
