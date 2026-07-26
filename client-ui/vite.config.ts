import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    root: path.resolve(__dirname),
    base: '/site/',
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'site.js',
                chunkFileNames: 'site-[name].js',
                assetFileNames: (asset) =>
                    asset.name?.endsWith('.css')
                        ? 'site.css'
                        : 'assets/[name][extname]',
            },
        },
    },
    server: {
        port: 5174,
        proxy: {
            '/api': 'http://localhost:3000',
        },
    },
});
