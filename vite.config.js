import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/erp.mgt.mn',        // ERP SPA source
  base: '/',             // Asset base path
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    minify: false
  }
});
