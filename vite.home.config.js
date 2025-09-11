import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  root: 'src/homepage',
  publicDir: 'src/homepage',    // ensure .htaccess, index.html/css live here
  plugins: [react()],
  optimizeDeps: { disabled: true },
  build: {
     outDir: 'dist/home',       // stays inside workspace on CI
    emptyOutDir: false
  }
});
