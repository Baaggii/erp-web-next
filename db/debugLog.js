import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to this module so it works regardless of the
// process's current working directory or bundling method.
const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = resolve(__dirname, '../api-server/logs/db.log');

let logFileReady = false;

function ensureLogFile() {
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
      console.log(`Debug log created at ${logFile}`);
    }
    logFileReady = true;
  } catch (err) {
    console.error('Failed to initialize debug log:', err);
  }
}

export function logDb(message) {
  try {
    if (!logFileReady) ensureLogFile();
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    console.log(`(db-log) ${message}`);
  } catch (err) {
    console.error('Failed to write debug log:', err);
  }
}

// Ensure the log file is created when this module is loaded
ensureLogFile();
logDb('Debug logger initialized');
