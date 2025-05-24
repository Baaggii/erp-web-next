import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',
  base: '/erp/',
  plugins: [react()],
  build: {
    outDir: '../../../../public_html/erp',
    emptyOutDir: false    
  }
});