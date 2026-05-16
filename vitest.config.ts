import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'infra',
          environment: 'node',
          include: ['infra/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['tests/web/**/*.test.{js,ts}'],
        },
      },
    ],
  },
});
