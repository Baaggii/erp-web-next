import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { getGeneralConfig } from './generalConfig.js';
import { pool } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';

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

function getCase(row, field) {
  if (!row) return undefined;
  if (row[field] !== undefined) return row[field];
  const lower = field.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function buildNameFromRow(row, fields = []) {
  const vals = fields.map((f) => getCase(row, f)).filter((v) => v);
  return sanitizeName(vals.join('_'));
}

function pickConfig(configs = {}, row = {}) {
  for (const cfg of Object.values(configs)) {
    if (!cfg.transactionTypeField || !cfg.transactionTypeValue) continue;
    const val = getCase(row, cfg.transactionTypeField);
    if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
      return cfg;
    }
  }
  return Object.values(configs)[0] || {};
}

function extractUnique(str) {
  const uuid = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const alt = str.match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/);
  if (alt) return alt[0];
  const long = str.match(/[A-Za-z0-9-]{8,}/);
  return long ? long[0] : '';
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

export async function detectIncompleteImages() {
  const { baseDir } = await getDirs();
  let results = [];
  let dirs;
  try {
    dirs = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of dirs) {
    if (!entry.isDirectory() || !entry.name.startsWith('transactions_')) continue;
    const dirPath = path.join(baseDir, entry.name);
    let files;
    try {
      files = await fs.readdir(dirPath);
    } catch {
      continue;
    }
    for (const f of files) {
      const ext = path.extname(f);
      const base = path.basename(f, ext);
      const parts = base.split('_');
      if (parts.length >= 5) continue;
      const unique = extractUnique(base);
      if (!unique || unique.length < 8) continue;
      const found = await findTxnByUniqueId(unique);
      if (!found) continue;
      const { row, configs, numField } = found;

      const cfg = pickConfig(configs, row);
      const fields = cfg?.imagenameField || [];
      let newBase = buildNameFromRow(row, fields);

      const transType = getCase(row, 'TransType');
      if (!newBase && !fields.length && !transType) {
        const fallback = [
          'z_mat_code',
          'or_bcode',
          'bmtr_pmid',
          'pmid',
          'sp_primary_code',
          'TransType',
          'trtype',
          'bmtr_num',
          'or_num',
          'z_num',
          'ordrnum',
          'num',
          'pid',
        ];
        const extra = [];
        const o1 = [getCase(row, 'bmtr_orderid'), getCase(row, 'bmtr_orderdid')]
          .filter(Boolean)
          .join('~');
        if (o1) extra.push(o1);
        const o2 = [getCase(row, 'ordrid'), getCase(row, 'ordrdid')]
          .filter(Boolean)
          .join('~');
        if (o2) extra.push(o2);
        newBase = buildNameFromRow(row, fallback);
        if (extra.length) newBase = sanitizeName([newBase, ...extra].join('_'));
      }

      if (!newBase && numField) {
        newBase = sanitizeName(String(row[numField]));
      }
      if (!newBase) continue;
      const folder = cfg?.imageFolder || entry.name;
      const newName = `${newBase}_${unique}${ext}`;
      results.push({
        folder,
        currentName: f,
        newName,
        currentPath: path.join(dirPath, f),
      });
    }
  }
  return results;
}

async function findTxnByUniqueId(idPart) {
  let tables;
  try {
    [tables] = await pool.query("SHOW TABLES LIKE 'transactions_%'");
  } catch {
    return null;
  }
  for (const row of tables || []) {
    const tbl = Object.values(row)[0];
    let cols;
    try {
      [cols] = await pool.query(`SHOW COLUMNS FROM \`${tbl}\``);
    } catch {
      continue;
    }
    const numCol = cols.find((c) => c.Field.toLowerCase().includes('num'));
    if (!numCol) continue;
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT * FROM \`${tbl}\` WHERE \`${numCol.Field}\` LIKE ? LIMIT 1`,
        [`%${idPart}%`],
      );
    } catch {
      continue;
    }
    if (rows.length) {
      let cfgs = {};
      try {
        cfgs = await getConfigsByTable(tbl);
      } catch {}
      return { table: tbl, row: rows[0], configs: cfgs, numField: numCol.Field };
    }
  }
  return null;
}

export async function fixIncompleteImages(list = []) {
  const { baseDir } = await getDirs();
  let count = 0;
  for (const item of list) {
    const dir = path.join(baseDir, item.folder || '');
    ensureDir(dir);
    try {
      await fs.rename(item.currentPath, path.join(dir, item.newName));
      count += 1;
    } catch {}
  }
  return count;
}
