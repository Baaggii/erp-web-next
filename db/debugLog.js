import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log file via URL semantics so bundlers keep the path correct.
const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = fileURLToPath(new URL('../api-server/logs/db.log', import.meta.url));

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
