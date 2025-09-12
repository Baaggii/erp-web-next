import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.home.config.js
export default defineConfig({
  base: '/',
  root: 'src/homepage',
  publicDir: 'src/homepage',
  plugins: [react()],
  build: {
    outDir: '../../../../public_html',
    emptyOutDir: false,
    minify: false      // disable esbuild minification
  },
  esbuild: {
    legalComments: 'none'
  }
})
