import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/server.ts', 'src/db.ts'],
      reporter: ['text', 'cobertura', 'lcov'],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
