import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: 'src/erp.mgt.mn',
  base: '/',             // Asset base path
  publicDir: 'src/erp.mgt.mn',   // Copy all files here (e.g. .htaccess)
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: path.resolve(__dirname, 'src/erp.mgt.mn/index.jsx') }
    }
  },
  plugins: [react()],
});
