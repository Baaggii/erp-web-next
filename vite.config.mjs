import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
export default defineConfig({
  root: 'src/client',
  base: '/erp/',
  publicDir: '.',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [ { src: '../.htaccess', dest: '' } ]
    })
  ],
  build: {
    outDir: '../../../../public_html/erp',
    emptyOutDir: true
  }
});