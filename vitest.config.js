import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives us a browser-like DOM (window, document, etc.)
    // without needing a real browser — perfect for component tests.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // Only pick up tests under src/ — the server/ directory has its own
    // Jest runner with a real DB connection, and Vitest must not touch it.
    include: ['src/**/*.test.{js,jsx}'],
  },
});
