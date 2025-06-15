import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to this module so it works regardless of the
// process's current working directory or bundling method.
const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = resolve(__dirname, '../api-server/logs/db.log');

export function logDb(message) {
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write debug log:', err);
  }
  console.log(message);
}

// Ensure the log file is created when this module is loaded
logDb('Debug logger initialized');
