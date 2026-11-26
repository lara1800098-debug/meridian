import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@theme': path.resolve(import.meta.dirname, 'theme'), 'server-only': path.resolve(import.meta.dirname, 'tests/server-only-stub.ts') } },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
