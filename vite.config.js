import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  root: 'src/erp.mgt.mn',
  base: '/',
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    // Production minification significantly reduces parse/execute time on first load.
    minify: mode === 'production' ? 'esbuild' : false,
    rollupOptions: {
      output: {
        // Keep heavy optional libraries in isolated chunks to improve route-level cache hit ratio.
        manualChunks(id) {
          if (id.includes('node_modules/xlsx') || id.includes('node_modules/jspdf')) {
            return 'vendor-docs';
          }
          if (id.includes('node_modules/socket.io-client')) {
            return 'vendor-realtime';
          }
        },
      },
    },
  },
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
}));
