import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['renderer/**/*.test.js', 'main/**/*.test.js'],
    environment: 'node',
  },
});
