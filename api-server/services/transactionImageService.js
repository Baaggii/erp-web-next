import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import mime from 'mime-types';
import { getGeneralConfig } from './generalConfig.js';

async function getDirs() {
  const cfg = await getGeneralConfig();
  const subdir = cfg.general?.imageDir || 'txn_images';
  const baseDir = path.join(process.cwd(), 'uploads', subdir);
  const urlBase = `/uploads/${subdir}`;
  return { baseDir, urlBase };
}

function ensureDir(dir) {
  if (!fssync.existsSync(dir)) {
    fssync.mkdirSync(dir, { recursive: true });
  }
}

export async function saveImages(table, name, files) {
  const { baseDir, urlBase } = await getDirs();
  const dir = path.join(baseDir, table);
  ensureDir(dir);
  const saved = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || `.${mime.extension(file.mimetype) || 'bin'}`;
    const fileName = `${name}_${Date.now()}${ext}`;
    const dest = path.join(dir, fileName);
    await fs.rename(file.path, dest);
    saved.push(`${urlBase}/${table}/${fileName}`);
  }
  return saved;
}

export async function listImages(table, name) {
  const { baseDir, urlBase } = await getDirs();
  const dir = path.join(baseDir, table);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.startsWith(name + '_'))
      .map((f) => `${urlBase}/${table}/${f}`);
  } catch {
    return [];
  }
}
