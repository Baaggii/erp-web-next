import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.home.config.js
export default defineConfig({
  base: '/',
  root: 'src/homepage',
  publicDir: 'src/homepage',
  plugins: [react()],
  optimizeDeps: { disabled: true } (skip esbuild pre-bundle),
  build: {
    outDir: '../../../../public_html',
    emptyOutDir: false,
    minify: false, 
    cssMinify: false, 
    target: 'es2020', 
    rollupOptions: {
      external: ['sharp', 'puppeteer']
    },
  },
  esbuild: {
    legalComments: 'none'
  }
})
