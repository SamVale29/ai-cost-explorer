import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/ai-cost-explorer/' : '/',
  server: {
    port: 4173,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    target: 'es2020',
  },
}));
