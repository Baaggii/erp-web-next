import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the log path relative to this module using URL semantics. This works
// even when the files are bundled or executed from another directory.
const logFile = fileURLToPath(new URL('../api-server/logs/db.log', import.meta.url));

export function logDb(message) {
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore logging errors
  }
  console.log(message);
}
