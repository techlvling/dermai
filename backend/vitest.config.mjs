import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    include: ['test/**/*.test.js'],
    deps: {
      inline: ['@supabase/supabase-js'],
    },
  },
});
