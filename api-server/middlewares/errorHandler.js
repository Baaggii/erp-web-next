import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, '../logs');
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
