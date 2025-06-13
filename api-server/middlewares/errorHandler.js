import fs from 'fs';
import path from 'path';

const logFile = path.resolve('api-server/logs/error.log');

export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${err.stack}\n`);
  } catch {
    // ignore logging errors
  }
  res
    .status(err.status || 500)
    .json({ message: err.message || 'Internal Server Error', stack: err.stack });
}
