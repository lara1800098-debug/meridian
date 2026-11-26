import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } },
  reporter: [['list']],
});
