import fs from 'fs';
import path from 'path';

export function getFormSchemas(req, res) {
  const cfgPath = path.resolve('config/forms.json');
  let data = { forms: [] };
  try {
    data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    // ignore
  }
  res.json(data.forms || []);
}
