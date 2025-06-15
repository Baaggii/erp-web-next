import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log file relative to the project root rather than to this module.
// Using process.cwd() ensures the location is stable regardless of how the file
// is executed (e.g. bundled or transpiled to a temp directory).
const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = path.resolve(process.cwd(), 'api-server', 'logs', 'db.log');

let logFileReady = false;
let initLogged = false;

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
if (!initLogged) {
  logDb('Debug logger initialized');
  initLogged = true;
}
