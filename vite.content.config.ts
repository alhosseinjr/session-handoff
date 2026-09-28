import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/content',
    emptyOutDir: false,
    sourcemap: process.env.NODE_ENV === 'development',
    lib: {
      entry: resolve(__dirname, 'src/content/content.ts'),
      name: 'ContentScript',
      formats: ['iife'],
      fileName: () => 'content.js'
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'inpage.css';
          return '[name]-[hash][extname]';
        }
      }
    }
  },
  resolve: { alias: { '@': resolve(__dirname, './src') } }
});
