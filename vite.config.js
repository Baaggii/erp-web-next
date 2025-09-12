import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/erp.mgt.mn',
  base: '/',
  publicDir: 'src/erp.mgt.mn',
  plugins: [react()],
  optimizeDeps: { disabled: true }, // skip esbuild pre-bundle
  esbuild: { legalComments: 'none' },
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    cssMinify: false,
    rollupOptions: {
      // ensure server-only deps never enter the browser bundle
      external: ['sharp', 'puppeteer']
    }
  }
})
