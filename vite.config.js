import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: 'src/client',          // ERP source folder
  base: '/erp/',               // Base path for deployment
  publicDir: '.',              // Copies all files in src/client (e.g. .htaccess here)
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: '../.htaccess', dest: '' }  // Copy project-root .htaccess into outDir
      ]
    })
  ],
  build: {
    outDir: '../../../../public_html/erp',  // Target directory
    emptyOutDir: true                       // Clean before build
  }
});