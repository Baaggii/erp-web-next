module.exports = {
  apps: [
    {
      name: 'erp-app',
      script: 'api-server/server.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};