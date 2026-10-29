import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same "@/" shortcut as tsconfig.json, so a test can import a module that uses it.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // The Expo app and the shared package have their own installs; the web's tests only cover the web.
    exclude: ['**/node_modules/**', 'apps/**', 'packages/**'],
  },
});
