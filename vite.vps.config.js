import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default ({ mode }) => {
  // This loads .env but does NOT manually inject
  loadEnv(mode, process.cwd());

  return defineConfig({
    plugins: [react()],
    root: resolve(__dirname, 'src/erp.mgt.mn'),
    build: {
      outDir: resolve(__dirname, 'dist-erp'),
      emptyOutDir: true,
    }
  });
};
