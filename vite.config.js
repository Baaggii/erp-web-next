
> **Note:** Place your `.htaccess` file inside `src/client` so Vite’s `publicDir` setting copies it to `public_html/erp` during the build.  
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',
  base: '/erp/',
  plugins: [react()],
  build: {
    outDir: '../../../../public_html/erp',
    emptyOutDir: true    
  }
});