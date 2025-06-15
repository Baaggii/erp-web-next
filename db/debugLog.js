import fs from 'fs';
import path from 'path';

const logFile = path.resolve('api-server/logs/db.log');

export function logDb(message) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore logging errors
  }
  console.log(message);
}
