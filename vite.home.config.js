const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

module.exports = defineConfig({
  root: 'src/homepage',               // homepage source folder
  base: '/',                          // serve at domain root
  publicDir: '.',                     // include all files in src/homepage (e.g. .htaccess)
  plugins: [react()],
  build: {
    outDir: '../../../../public_html', // publish to public_html/
    emptyOutDir: true
  }
})
