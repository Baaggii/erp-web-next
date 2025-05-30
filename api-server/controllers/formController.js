import fs from 'fs';
import path from 'path';
export function getFormSchemas(req, res) {
  const schemasDir = path.resolve('config/formSchemas');
  const files = fs.readdirSync(schemasDir);
  const schemas = files.map(f => JSON.parse(fs.readFileSync(path.join(schemasDir, f))));
  res.json(schemas);
}