import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import mime from 'mime-types';
import { getGeneralConfig } from './generalConfig.js';

async function getDirs() {
  const cfg = await getGeneralConfig();
  const store = cfg.imageStorage || {};
  const base = store.basePath || 'uploaded_images';
  const baseDir = path.join(process.cwd(), base);
  const urlBase = `/${base.replace(/\/+$/, '')}`;
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

function sanitizePath(dir) {
  return dir
    .split('/')
    .map((p) => sanitizeName(p))
    .filter(Boolean)
    .join('/');
}

export async function saveImages(table, name, files, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, sanitizePath(folder), table);
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
      ? `${urlBase}/${sanitizePath(folder)}/${table}/${fileName}`
      : `${urlBase}/${table}/${fileName}`;
    saved.push(url);
  }
  return saved;
}

export async function listImages(table, name, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, sanitizePath(folder), table);
  ensureDir(dir);
  const prefix = sanitizeName(name);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.startsWith(prefix + '_'))
      .map((f) =>
        folder
          ? `${urlBase}/${sanitizePath(folder)}/${table}/${f}`
          : `${urlBase}/${table}/${f}`,
      );
  } catch {
    return [];
  }
}

export async function renameImages(table, oldName, newName, folder = '') {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, sanitizePath(folder), table);
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
          ? `${urlBase}/${sanitizePath(folder)}/${table}/${newFile}`
          : `${urlBase}/${table}/${newFile}`;
        renamed.push(url);
      }
    }
    return renamed;
  } catch {
    return [];
  }
}

export async function deleteImages(table, name, folder = '', file = '') {
  const { baseDir } = await getDirs();
  const dir = path.join(baseDir, sanitizePath(folder), table);
  try {
    if (file) {
      await fs.unlink(path.join(dir, file));
      return [file];
    }
    const prefix = sanitizeName(name);
    const files = await fs.readdir(dir);
    const deleted = [];
    for (const f of files) {
      if (f.startsWith(prefix + '_')) {
        await fs.unlink(path.join(dir, f));
        deleted.push(f);
      }
    }
    return deleted;
  } catch {
    return [];
  }
}
