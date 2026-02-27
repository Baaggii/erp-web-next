import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/erp.mgt.mn'),
  envDir: resolve(__dirname),   // 🔥 THIS IS THE FIX
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-erp'),
    emptyOutDir: true,
  },
});
