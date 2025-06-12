import fs from 'fs';
import path from 'path';

const logFile = path.resolve('api-server/logs/error.log');

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
