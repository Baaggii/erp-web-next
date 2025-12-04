import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/erp.mgt.mn'),
  build: {
    outDir: resolve(__dirname, 'dist-erp'),
    emptyOutDir: true,
  },
});
