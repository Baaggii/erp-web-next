import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/erp/',
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../../../public_html',
    emptyOutDir: true,
    target: 'esnext',
    manifest: true,
    minify: false,
    sourcemap: false,
    brotliSize: false
  }
})
