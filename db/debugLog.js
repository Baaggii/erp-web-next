import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to the repo regardless of CWD
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(__dirname, '../api-server/logs/db.log');

export function logDb(message) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore logging errors
  }
  console.log(message);
}
