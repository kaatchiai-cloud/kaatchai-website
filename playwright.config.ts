import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'web-smoke',
      testDir: './tests/e2e',
    },
  ],
});
