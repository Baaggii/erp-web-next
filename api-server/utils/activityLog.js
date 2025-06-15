import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to this module so it works regardless of
// the current working directory or bundling method.
const logFile = fileURLToPath(new URL('../logs/activity.log', import.meta.url));

let logFileReady = false;
let initLogged = false;

function ensureLogFile() {
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
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
