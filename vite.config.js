import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/erp.mgt.mn',        // ERP SPA source
  base: '/',             // Asset base path
  publicDir: 'src/erp.mgt.mn',   // Copy all files here (e.g. .htaccess)
  plugins: [react()],
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    minify: false
  }
});
