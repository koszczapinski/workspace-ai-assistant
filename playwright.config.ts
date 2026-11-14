import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.BETTER_AUTH_SECRET ? { BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET } : {}),
      BETTER_AUTH_URL: baseURL,
      OPENAI_API_KEY: '',
      CHAT_FAKE_PROVIDER: 'true',
      CHAT_FAKE_PROVIDER_DELAY_MS: process.env.CHAT_FAKE_PROVIDER_DELAY_MS ?? '120',
      DEMO_USER_A_EMAIL: process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test',
      DEMO_USER_A_PASSWORD: process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password',
      DEMO_USER_B_EMAIL: process.env.DEMO_USER_B_EMAIL ?? 'user-b@example.test',
      DEMO_USER_B_PASSWORD: process.env.DEMO_USER_B_PASSWORD ?? 'test-user-b-password',
    },
  },
});
