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
    minify: false,
    rollupOptions: {
      external: ['sharp', 'puppeteer']
    }
  }
})
