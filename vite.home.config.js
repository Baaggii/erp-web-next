import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  root: 'src/homepage',
  publicDir: 'src/homepage',    // ensure .htaccess, index.html/css live here
  plugins: [react()],
  build: {
    outDir: '../../../../public_html',
    emptyOutDir: false
  }
});
