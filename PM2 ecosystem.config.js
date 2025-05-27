// File: ecosystem.config.js
export default {
  apps: [
    {
      name: 'erp-app',
      script: './api-server/server.js',
      // tell PM2 this is an ES module
      interpreter: 'node',
      interpreter_args: '--experimental-specifier-resolution=node',
      env: {
        API_PORT: 3002,                // ← match your manual test port
        NODE_ENV: 'production'
      }
    }
  ]
};
