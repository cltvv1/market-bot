import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
    define: { 'import.meta.env.REFERENCE_DEV_SERVER': command === 'serve' },
    root: path.resolve(__dirname),
    cacheDir: path.resolve(__dirname, '..', 'node_modules', '.vite-admin'),
    base: '/admin/',
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'admin.js',
                chunkFileNames: 'admin-[name].js',
                assetFileNames: (asset) =>
                    asset.name?.endsWith('.css')
                        ? 'admin.css'
                        : 'admin-[name][extname]',
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/admin/api': 'http://localhost:3000',
        },
    },
}));
