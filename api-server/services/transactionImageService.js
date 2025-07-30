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

function sanitizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '_');
}

export async function saveImages(table, name, files, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, table, sanitizeName(folder));
  ensureDir(dir);
  const saved = [];
  const prefix = sanitizeName(name);
  for (const file of files) {
    const ext = path.extname(file.originalname) || `.${mime.extension(file.mimetype) || 'bin'}`;
    const fileName = `${prefix}_${Date.now()}${ext}`;
    const dest = path.join(dir, fileName);
    try {
      if (file.size > 1500000) {
        let sharpLib;
        try {
          sharpLib = (await import('sharp')).default;
        } catch {}
        if (sharpLib) {
          await sharpLib(file.path)
            .resize({ width: 1200, height: 1200, fit: 'inside' })
            .toFile(dest);
          await fs.unlink(file.path);
        } else {
          await fs.rename(file.path, dest);
        }
      } else {
        await fs.rename(file.path, dest);
      }
    } catch {
      await fs.rename(file.path, dest);
    }
    const url = folder
      ? `${urlBase}/${table}/${sanitizeName(folder)}/${fileName}`
      : `${urlBase}/${table}/${fileName}`;
    saved.push(url);
  }
  return saved;
}

export async function listImages(table, name, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, table, sanitizeName(folder));
  ensureDir(dir);
  const prefix = sanitizeName(name);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.startsWith(prefix + '_'))
      .map((f) =>
        folder
          ? `${urlBase}/${table}/${sanitizeName(folder)}/${f}`
          : `${urlBase}/${table}/${f}`,
      );
  } catch {
    return [];
  }
}

export async function renameImages(table, oldName, newName, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, table, sanitizeName(folder));
  ensureDir(dir);
  const oldPrefix = sanitizeName(oldName);
  const newPrefix = sanitizeName(newName);
  try {
    const files = await fs.readdir(dir);
    const renamed = [];
    for (const file of files) {
      if (file.startsWith(oldPrefix + '_')) {
        const rest = file.slice(oldPrefix.length);
        const newFile = newPrefix + rest;
        await fs.rename(path.join(dir, file), path.join(dir, newFile));
        const url = folder
          ? `${urlBase}/${table}/${sanitizeName(folder)}/${newFile}`
          : `${urlBase}/${table}/${newFile}`;
        renamed.push(url);
      }
    }
    return renamed;
  } catch {
    return [];
  }
}
