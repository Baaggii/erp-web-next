import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const joyrideAlias = (() => {
  if (process.env.VITE_ENABLE_TOURS === 'false') {
    return path.resolve(__dirname, 'src/erp.mgt.mn/shims/react-joyride.js')
  }
  try {
    require.resolve('react-joyride')
    return 'react-joyride'
  } catch {
    return path.resolve(__dirname, 'src/erp.mgt.mn/shims/react-joyride.js')
  }
})()

export default defineConfig({
  root: 'src/erp.mgt.mn',
  base: '/',
  publicDir: 'src/erp.mgt.mn',
  plugins: [react()],
  resolve: {
    alias: {
      'react-joyride': joyrideAlias
    }
  },
  optimizeDeps: { noDiscovery: true }, // skip esbuild pre-bundle
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
