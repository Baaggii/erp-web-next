// PM2 configuration tuned for long-running JSON conversion jobs
export default {
  apps: [
    {
      name: 'erp-app',
      script: './api-server/server.js',
      interpreter: 'node',
      interpreter_args: '--experimental-specifier-resolution=node',
      env: {
        API_PORT: 3002, // align with api-server/server.js
        NODE_ENV: 'production',
        SERVER_TIMEOUT_MS: 900000, // 15 minutes to allow large ALTER TABLE jobs
        SERVER_HEADERS_TIMEOUT_MS: 905000,
        SERVER_KEEP_ALIVE_TIMEOUT_MS: 120000,
        JSON_CONVERSION_LOG_PATH: './api-server/logs/json_conversion.log',
      },
      // Allow extra time for the process to boot and to shut down cleanly
      listen_timeout: 120000,
      kill_timeout: 120000,
    },
  ],
};
