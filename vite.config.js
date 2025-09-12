import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config.js
export default defineConfig({
  root: 'src/erp.mgt.mn',
  base: '/',
  publicDir: 'src/erp.mgt.mn',
  plugins: [react()],
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    optimizeDeps: { disabled: true } (skip esbuild pre-bundle),
    minify: false, 
    cssMinify: false, 
    target: 'es2020', 
    rollupOptions: {
      external: ['sharp', 'puppeteer']
    },
  esbuild: { 
    legalComments: 'none' 
    }
  }
})
