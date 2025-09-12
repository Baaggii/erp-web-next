import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  root: 'src/homepage',
  publicDir: 'src/homepage',
  plugins: [react()],
  optimizeDeps: { disabled: true }, // skip esbuild pre-bundle
  esbuild: { legalComments: 'none' },
  build: {
    outDir: '../../../../public_html',
    emptyOutDir: false,
    target: 'es2020',
    minify: false,
    cssMinify: false
  }
})
