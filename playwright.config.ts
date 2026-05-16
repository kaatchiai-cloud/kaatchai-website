import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'web-smoke',
      testDir: './tests/e2e',
      use: {
        baseURL: 'http://localhost:4173',
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'pnpm preview',
    port: 4173,
    reuseExistingServer: true,
  },
});
