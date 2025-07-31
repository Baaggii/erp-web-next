import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { getGeneralConfig } from './generalConfig.js';
import { pool } from '../../db/index.js';
import { getConfigsByTable } from './transactionFormConfig.js';
import { slugify } from '../utils/slugify.js';

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
    .replace(/[^a-z0-9_~\-]+/gi, '_');
}

function containsToken(str = '', token = '') {
  if (!token) return false;
  const re = new RegExp(`(?:^|[~_-])${token}(?:[~_-]|$)`, 'i');
  return re.test(str);
}

function getFieldCase(row, field) {
  if (!row) return undefined;
  if (row[field] !== undefined) return row[field];
  const lower = field.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function buildNameFromRow(row, fields = []) {
  const vals = fields.map((f) => getFieldCase(row, f)).filter((v) => v);
  return sanitizeName(vals.join('_'));
}

function pickConfig(configs = {}, row = {}) {
  for (const cfg of Object.values(configs)) {
    if (!cfg.transactionTypeField || !cfg.transactionTypeValue) continue;
    const val = getFieldCase(row, cfg.transactionTypeField);
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

function parseFileUnique(base) {
  const unique = extractUnique(base);
  if (!unique) return { unique: '', suffix: '' };
  const idx = base.toLowerCase().indexOf(unique.toLowerCase());
  const suffix = idx >= 0 ? base.slice(idx + unique.length) : '';
  return { unique, suffix };
}

function buildFolderName(row, fallback = '') {
  const part1 =
    getFieldCase(row, 'trtype') ||
    getFieldCase(row, 'TRTYPE') ||
    getFieldCase(row, 'trtypenum');
  const part2 =
    getFieldCase(row, 'TransType') ||
    getFieldCase(row, 'UITransType') ||
    getFieldCase(row, 'UITransTypeName') ||
    getFieldCase(row, 'TRTYPENAME') ||
    getFieldCase(row, 'trtypename') ||
    getFieldCase(row, 'uitranstypename') ||
    getFieldCase(row, 'transtype');
  if (part1 && part2) {
    return `${slugify(String(part2))}/${slugify(String(part1))}`;
  }
  return fallback;
}

function buildOptionalTokens(row) {
  const tokens = [];
  const groupA = [
    'z_mat_code',
    'or_bcode',
    'bmtr_pmid',
    'pmid',
    'sp_primary_code',
    'pid',
  ];
  groupA
    .map((f) => getFieldCase(row, f))
    .filter(Boolean)
    .forEach((v) => tokens.push(sanitizeName(v)));

  const o1 = [getFieldCase(row, 'bmtr_orderid'), getFieldCase(row, 'bmtr_orderdid')]
    .filter(Boolean)
    .map((v) => sanitizeName(v));
  if (o1.length) tokens.push(o1.join('~'));
  const o2 = [getFieldCase(row, 'ordrid'), getFieldCase(row, 'ordrdid')]
    .filter(Boolean)
    .map((v) => sanitizeName(v));
  if (o2.length) tokens.push(o2.join('~'));

  const groupB = [
    'TransType',
    'trtype',
    'bmtr_num',
    'or_num',
    'z_num',
    'ordrnum',
    'num',
  ];
  groupB
    .map((f) => getFieldCase(row, f))
    .filter(Boolean)
    .forEach((v) => tokens.push(sanitizeName(v)));

  return tokens.filter(Boolean);
}

function buildOptionalName(row) {
  const tokens = buildOptionalTokens(row);
  return sanitizeName(tokens.join('_'));
}

function appendOptionalParts(row, base) {
  const tokens = buildOptionalTokens(row);
  if (tokens.length === 0) return sanitizeName(base);
  let baseSan = sanitizeName(base);
  const missing = tokens.filter((t) => !containsToken(baseSan, t));
  if (missing.length === 0) return baseSan;
  const combined = baseSan ? `${baseSan}_${missing.join('_')}` : missing.join('_');
  return sanitizeName(combined);
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

export async function detectIncompleteImages(page = 1, perPage = 100) {
  const { baseDir } = await getDirs();
  let results = [];
  const offset = (page - 1) * perPage;
  let count = 0;
  let hasMore = false;

  async function walk(dir, insideTxn = false) {
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (hasMore) return;
      const full = path.join(dir, it.name);
      if (it.isDirectory()) {
        const nextInside = insideTxn || it.name.startsWith('transactions_');
        await walk(full, nextInside);
      } else if (insideTxn && it.isFile()) {
        const item = await resolveImageRename(it.name);
        if (!item) continue;
        count += 1;
        if (count > offset && results.length < perPage) {
          results.push({
            folder: item.folder,
            folderDisplay: item.folderDisplay,
            currentName: it.name,
            newName: item.newName,
            currentPath: full,
          });
        } else if (results.length >= perPage) {
          hasMore = true;
          return;
        }
      }
    }
  }

  await walk(baseDir, false);
  return { list: results, hasMore };
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

export async function resolveImageRename(name = '', index = undefined) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const { unique, suffix } = parseFileUnique(base);
  if (!unique) return null;
  const checkBase = sanitizeName(base.replace(new RegExp(unique, 'i'), ''));
  if (/\b\d{4}\b/.test(checkBase) || /\b[a-z]{4}\b/i.test(checkBase)) {
    return null;
  }
  const found = await findTxnByUniqueId(unique);
  if (!found) return null;
  const { row, configs, numField } = found;
  const cfg = pickConfig(configs, row);
  let newBase = buildNameFromRow(row, cfg?.imagenameField || []);
  const transDigit = getFieldCase(row, 'trtype');
  const transType = getFieldCase(row, 'TransType');
  if (!newBase && !(cfg?.imagenameField || []).length && !transType) {
    newBase = buildOptionalName(row);
  }
  newBase = appendOptionalParts(row, newBase);
  if (!newBase && numField) {
    newBase = sanitizeName(String(row[numField]));
  }
  if (!newBase) return null;
  if (transDigit && !containsToken(sanitizeName(newBase), sanitizeName(transDigit))) {
    newBase = sanitizeName(`${transDigit}_${newBase}`);
  }
  if (transType && !containsToken(sanitizeName(newBase), sanitizeName(transType))) {
    newBase = sanitizeName(`${newBase}_${transType}`);
  }
  const folderRaw = buildFolderName(row, cfg?.imageFolder || found.table);
  const folderDisplay = '/' + String(folderRaw).replace(/^\/+/, '');
  const sanitizedUnique = sanitizeName(unique);
  let finalBase = newBase;
  if (sanitizeName(newBase).includes(sanitizedUnique)) {
    finalBase = `${newBase}${suffix}`;
  } else {
    finalBase = `${newBase}_${unique}${suffix}`;
  }
  const newName = `${finalBase}${ext}`;
  return { index, originalName: name, newName, folder: folderRaw, folderDisplay };
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

export async function checkFolderNames(list = []) {
  const results = [];
  for (const item of list) {
    const name = item?.name || '';
    const index = item?.index;
    const res = await resolveImageRename(name, index);
    if (res) results.push(res);
  }
  return results;
}

export async function uploadSelectedImages(files = [], meta = []) {
  const metaMap = new Map(meta.map((m) => [m.name, m]));
  const { baseDir } = await getDirs();
  let count = 0;
  for (const file of files) {
    const m = metaMap.get(file.originalname);
    if (!m) {
      await fs.unlink(file.path).catch(() => {});
      continue;
    }
    const dir = path.join(baseDir, m.folder || '');
    ensureDir(dir);
    try {
      await fs.rename(file.path, path.join(dir, m.newName));
      count += 1;
    } catch {
      await fs.unlink(file.path).catch(() => {});
    }
  }
  return count;
}

export async function findBenchmarkCode(fileName) {
  const base = path.basename(fileName).toLowerCase();
  const name = base.replace(/\.[^.]+$/, '');
  const tokens = name.split(/[_-]+/).filter(Boolean);

  for (const t of tokens) {
    try {
      const [rows] = await pool.query(
        'SELECT UITransType FROM code_transaction WHERE UITransType = ? LIMIT 1',
        [t],
      );
      if (rows.length) return String(rows[0].UITransType);
    } catch {}
  }

  try {
    const [rows] = await pool.query(
      'SELECT UITransType, UITrtype FROM code_transaction WHERE image_benchmark = 1',
    );
    for (const r of rows) {
      const code = String(r.UITrtype || '').toLowerCase();
      if (code && base.includes(code)) return String(r.UITransType);
    }
  } catch {}

  return null;
}
