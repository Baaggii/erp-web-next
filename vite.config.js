import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/erp/',
  plugins: [react()],
  root: 'src/client',
  build: {
     rollupOptions: {
    input: 'src/client/index.html'
  },
    outDir: '../../../../public_html/erp',
    emptyOutDir: true,
    target: 'esnext',
    manifest: true,
    minify: false,
    sourcemap: false,
    brotliSize: false
  }
})