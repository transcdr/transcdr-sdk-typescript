import { defineConfig } from 'vitest/config';

// The SDK's own config, so vitest does not climb to the dashboard's
// vite.config.ts (and its plugins) one directory up.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
