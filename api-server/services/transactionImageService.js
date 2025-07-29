import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import mime from 'mime-types';

const baseDir = path.join(process.cwd(), 'uploads', 'txn_images');

function ensureDir(dir) {
  if (!fssync.existsSync(dir)) {
    fssync.mkdirSync(dir, { recursive: true });
  }
}

export async function saveImages(table, name, files) {
  const dir = path.join(baseDir, table);
  ensureDir(dir);
  const saved = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || `.${mime.extension(file.mimetype) || 'bin'}`;
    const fileName = `${name}_${Date.now()}${ext}`;
    const dest = path.join(dir, fileName);
    await fs.rename(file.path, dest);
    saved.push(`/uploads/txn_images/${table}/${fileName}`);
  }
  return saved;
}

export async function listImages(table, name) {
  const dir = path.join(baseDir, table);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.startsWith(name + '_'))
      .map((f) => `/uploads/txn_images/${table}/${f}`);
  } catch {
    return [];
  }
}
