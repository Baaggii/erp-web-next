import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',        // ERP SPA source
  base: '/erp/',             // Asset base path
  publicDir: 'src/client',   // Copy all files here (e.g. .htaccess)
  plugins: [react()],
  build: {
    outDir: '../../../../public_html/erp',
    emptyOutDir: true
  }
});