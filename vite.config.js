import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';



// vite.config.js (relevant excerpt)
export default {
  root: './src/erp.mgt.mn',
  build: {
    ooutDir: '../../../../erp.mgt.mn',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: path.resolve(__dirname, 'src/erp.mgt.mn/index.jsx') }
    }
  },
  plugins: [react()],
};
