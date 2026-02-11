import crypto from 'node:crypto';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to this module so it works regardless of
// the process's current working directory or bundling method.
const logFile = fileURLToPath(new URL('../logs/error.log', import.meta.url));

export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${err.stack}\n`);
  } catch (logErr) {
    console.error('Failed to write error log:', logErr);
  }

  const status = err.status || (err.code === 'EBADCSRFTOKEN' ? 403 : 500);
  const correlationId = req?.correlationId || req?.headers?.['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', correlationId);

  const message =
    err.code === 'EBADCSRFTOKEN'
      ? 'Invalid or expired CSRF token'
      : err.message || 'Internal Server Error';

  const code = err.code === 'EBADCSRFTOKEN' ? 'CSRF_TOKEN_INVALID' : err.code || 'INTERNAL_ERROR';

  return res.status(status).json({
    status,
    error: {
      code,
      message,
      correlationId,
    },
  });
}
