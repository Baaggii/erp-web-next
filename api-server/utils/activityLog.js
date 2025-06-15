import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = path.resolve(process.cwd(), 'api-server', 'logs', 'activity.log');

let logFileReady = false;
let initLogged = false;

function ensureLogFile() {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
      console.log(`Activity log created at ${logFile}`);
    }
    logFileReady = true;
  } catch (err) {
    console.error('Failed to initialize activity log:', err);
  }
}

export function logActivity(message) {
  try {
    if (!logFileReady) ensureLogFile();
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

ensureLogFile();
if (!initLogged) {
  logActivity('Activity logger initialized');
  initLogged = true;
}
