import fs from 'fs';
import path from 'path';

const logDir = path.resolve('api-server/logs');
const logFile = path.join(logDir, 'error.log');

export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const logLine = `[${new Date().toISOString()}] ${err.stack}\n`;
  fs.promises
    .mkdir(logDir, { recursive: true })
    .then(() => fs.promises.appendFile(logFile, logLine))
    .catch((e) => console.error('Failed to write log', e));
  res
    .status(err.status || 500)
    .json({ message: err.message || 'Internal Server Error' });
}
