import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

loadEnvConfig(process.cwd());

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
