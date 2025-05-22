import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config targeting sub‑folder deployment at /erp/
export default defineConfig({
  base: '/erp/',
  plugins: [react()],
  build: {
    outDir: 'dist'
  }
});
