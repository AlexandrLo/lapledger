import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // This should be kept manually in sync with the `paths` in tsconfig
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@worker': fileURLToPath(new URL('./src/worker', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
});
