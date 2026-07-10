import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'admin.js',
        chunkFileNames: 'admin-[name].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'admin.css' : 'admin-[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://localhost:3000',
    },
  },
});
