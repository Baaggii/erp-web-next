import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { getGeneralConfig } from './generalConfig.js';

async function getDirs() {
  const cfg = await getGeneralConfig();
  const subdir = cfg.general?.imageDir || 'txn_images';
  const basePath = cfg.general?.imageStorage?.basePath || 'uploads';
  const baseDir = path.join(process.cwd(), basePath, subdir);
  const urlBase = `/${basePath}/${subdir}`;
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

export async function saveImages(table, name, files, folder = null) {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, folder || table);
  ensureDir(dir);
  const saved = [];
  const prefix = sanitizeName(name);
  let mimeLib;
  try {
    mimeLib = (await import('mime-types')).default;
  } catch {}
  for (const file of files) {
    const ext =
      path.extname(file.originalname) || `.${mimeLib?.extension(file.mimetype) || 'bin'}`;
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${prefix}_${unique}${ext}`;
    const dest = path.join(dir, fileName);
    let optimized = false;
    try {
    let sharpLib;
      try {
        sharpLib = (await import('sharp')).default;
      } catch {}
      if (sharpLib) {
        const image = sharpLib(file.path).resize({ width: 1200, height: 1200, fit: 'inside' });
        if (/\.jpe?g$/i.test(ext)) {
          await image.jpeg({ quality: 80 }).toFile(dest);
        } else if (/\.png$/i.test(ext)) {
          await image.png({ quality: 80 }).toFile(dest);
        } else if (/\.webp$/i.test(ext)) {
          await image.webp({ quality: 80 }).toFile(dest);
        } else {
          await image.toFile(dest);
        }
        await fs.unlink(file.path);
        optimized = true;
      }
    } catch {}
    if (!optimized) {
      try {
        await fs.rename(file.path, dest);
      } catch {
        // ignore
      }
    }
    saved.push(`${urlBase}/${folder || table}/${fileName}`);
  }
  return saved;
}

export async function listImages(table, name, folder = null) {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, folder || table);
  ensureDir(dir);
  const prefix = sanitizeName(name);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.startsWith(prefix + '_'))
      .map((f) => `${urlBase}/${folder || table}/${f}`);
  } catch {
    return [];
  }
}

export async function renameImages(table, oldName, newName, folder = null) {
  const { baseDir, urlBase } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, table);
  ensureDir(dir);
  const targetDir = folder ? path.join(baseDir, folder) : dir;
  ensureDir(targetDir);
  const oldPrefix = sanitizeName(oldName);
  const newPrefix = sanitizeName(newName);
  try {
    const files = await fs.readdir(dir);
    const renamed = [];
    for (const f of files) {
      if (f.startsWith(oldPrefix + '_')) {
        const rest = f.slice(oldPrefix.length);
        const dest = path.join(targetDir, newPrefix + rest);
        await fs.rename(path.join(dir, f), dest);
        const folderPart = folder || table;
        renamed.push(`${urlBase}/${folderPart}/${newPrefix + rest}`);
      }
    }
    return renamed;
  } catch {
    return [];
  }
}

export async function deleteImage(table, file, folder = null) {
  const { baseDir } = await getDirs();
  const dir = path.join(baseDir, folder || table);
  try {
    await fs.unlink(path.join(dir, path.basename(file)));
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllImages(table, name, folder = null) {
  const { baseDir } = await getDirs();
  ensureDir(baseDir);
  const dir = path.join(baseDir, folder || table);
  ensureDir(dir);
  const prefix = sanitizeName(name);
  try {
    const files = await fs.readdir(dir);
    const deleted = [];
    for (const f of files) {
      if (f.startsWith(prefix + '_')) {
        await fs.unlink(path.join(dir, f));
        deleted.push(f);
      }
    }
    return deleted.length;
  } catch {
    return 0;
  }
}

export async function cleanupOldImages(days = 30) {
  const { baseDir } = await getDirs();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(full);
            removed += 1;
          }
        } catch {}
      }
    }
  }

  await walk(baseDir);
  await walk(path.join(process.cwd(), 'uploads', 'tmp'));

  return removed;
}
