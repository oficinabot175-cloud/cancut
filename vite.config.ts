import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base relativa: funciona en GitHub Pages (usuario.github.io/repositorio/) y en local.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
  server: { port: 5173, open: true },
});
