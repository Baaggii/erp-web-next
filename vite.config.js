import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',          // Source folder for ERP SPA
  base: '/erp/',               // Base path for asset resolution
  publicDir: '.',              // Copy all files in src/client (e.g. .htaccess)
  plugins: [react()],
  build: {
    outDir: '../../../../public_html/erp',  // Output directory
    emptyOutDir: true                       // Clear old files
  }
});