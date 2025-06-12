import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.resolve(__dirname, '../logs/error.log');

export async function listErrorLog(req, res, next) {
  try {
    if (!fs.existsSync(logFile)) {
      return res.type('text/plain').send('');
    }
    const data = await fs.promises.readFile(logFile, 'utf8');
    res.type('text/plain').send(data);
  } catch (err) {
    next(err);
  }
}
