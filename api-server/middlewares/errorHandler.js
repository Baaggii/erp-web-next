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
  const body = { message: err.message || 'Internal Server Error' };
  if (process.env.NODE_ENV === 'development') {
    body.stack = err.stack;
  }
  res.status(err.status || 500).json(body);
}
