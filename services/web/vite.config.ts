/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/inventory': 'http://localhost:8000',
      '/api/checkout': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/**'],
      reporter: ['text', 'cobertura', 'lcov'],
    },
  },
});
