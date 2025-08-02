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
    if (!cfg.transactionTypeValue) continue;
    if (cfg.transactionTypeField) {
      const val = getCase(row, cfg.transactionTypeField);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        return cfg;
      }
    } else {
      const matchField = Object.keys(row).find(
        (k) => String(getCase(row, k)) === String(cfg.transactionTypeValue),
      );
      if (matchField) {
        return { ...cfg, transactionTypeField: matchField };
      }
    }
  }
  return Object.values(configs)[0] || {};
}

function extractUnique(str) {
  // Strip saveImages timestamp/random suffix if present
  const cleaned = str.replace(/_[0-9]{13}_[a-z0-9]{6}$/i, '');
  const uuid = cleaned.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuid) return uuid[0];
  const alt = cleaned.match(/[A-Za-z0-9]{4,}(?:[-_][A-Za-z0-9]{4,}){3,}/);
  if (alt) return alt[0].replace(/[-_]\d+$/, '');
  const long = cleaned.match(/[A-Za-z0-9_-]{8,}/);
  return long ? long[0].replace(/[-_]\d+$/, '') : '';
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
    getCase(row, 'trtype') ||
    getCase(row, 'TRTYPENAME') ||
    getCase(row, 'trtypename') ||
    getCase(row, 'uitranstypename') ||
    getCase(row, 'transtype');
  const part2 =
    getCase(row, 'TransType') ||
    getCase(row, 'UITransType') ||
    getCase(row, 'UITransTypeName') ||
    getCase(row, 'trtype');
  if (part1 && part2) {
    return `${slugify(String(part1))}/${slugify(String(part2))}`;
  }
  return fallback;
}

export async function findBenchmarkCode(name) {
  if (!name) return null;
  const base = path.basename(name, path.extname(name));
  const parts = base.split(/[_-]/).filter(Boolean);
  for (const p of parts) {
    const [rows] = await pool.query(
      'SELECT UITransType FROM code_transaction WHERE UITransType = ?',
      [p],
    );
    if (rows?.length) return rows[0].UITransType;
  }
  const [rows] = await pool.query(
    'SELECT UITransType, UITrtype FROM code_transaction WHERE image_benchmark = 1',
  );
  for (const row of rows || []) {
    const mark = row.UITrtype;
    if (mark && base.toLowerCase().includes(String(mark).toLowerCase())) {
      return row.UITransType;
    }
  }
  return null;
}

async function findTxnByParts(inv, sp, transType, timestamp) {
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
    const invCol = cols.find((c) => ['inventory_code', 'z_mat_code'].includes(c.Field.toLowerCase()));
    const spCol = cols.find((c) => c.Field.toLowerCase() === 'sp_primary_code');
    const transCol = cols.find((c) => ['transtype', 'uitranstype', 'ui_transtype'].includes(c.Field.toLowerCase()));
    const dateCol = cols.find((c) => c.Field.toLowerCase().includes('date'));
    if (!invCol || !spCol || !transCol) continue;
    let sql = `SELECT * FROM \`${tbl}\` WHERE \`${invCol.Field}\` = ? AND \`${spCol.Field}\` = ? AND \`${transCol.Field}\` = ?`;
    const params = [inv, sp, transType];
    if (dateCol) {
      sql += ` AND ABS(TIMESTAMPDIFF(SECOND, FROM_UNIXTIME(?/1000), \`${dateCol.Field}\`)) < 86400`;
      params.push(timestamp);
    }
    sql += ' LIMIT 1';
    let rows;
    try {
      [rows] = await pool.query(sql, params);
    } catch {
      continue;
    }
    if (rows.length) {
      let cfgs = {};
      try {
        cfgs = await getConfigsByTable(tbl);
      } catch {}
      return { table: tbl, row: rows[0], configs: cfgs, numField: transCol.Field };
    }
  }
  return null;
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
  let dirs;
  const offset = (page - 1) * perPage;
  let count = 0;
  let hasMore = false;
  let totalFiles = 0;
  let incompleteFound = 0;
  const folders = new Set();
  try {
    dirs = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return { list: results, hasMore, summary: { totalFiles: 0, folders: [], incompleteFound: 0, processed: 0 } };
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
    folders.add(entry.name);
    totalFiles += files.length;
    const limit = perPage * page;
    files = files.slice(0, limit);
    for (const f of files) {
      const ext = path.extname(f);
      const base = path.basename(f, ext);
      const parts = base.split('_');
      const isSave = /_\d{13}_[a-z0-9]{6}$/i.test(base);
      if (parts.length >= 5 && !isSave) continue;
      let unique = '';
      let suffix = '';
      let found;
      if (isSave) {
        const [inv, sp, transType, ts] = parts;
        found = await findTxnByParts(inv, sp, transType, Number(ts));
      } else {
        ({ unique, suffix } = parseFileUnique(base));
        if (!unique || unique.length < 8) continue;
        found = await findTxnByUniqueId(unique);
      }
      if (!found) continue;
      const { row, configs, numField } = found;

      const cfg = pickConfig(configs, row);
      let newBase = '';
      let folderRaw = '';
      const tType =
        getCase(row, 'trtype') ||
        getCase(row, 'UITrtype') ||
        getCase(row, 'TRTYPENAME') ||
        getCase(row, 'trtypename') ||
        getCase(row, 'uitranstypename') ||
        getCase(row, 'transtype');
      const transTypeVal =
        getCase(row, 'TransType') ||
        getCase(row, 'UITransType') ||
        getCase(row, 'UITransTypeName') ||
        getCase(row, 'transtype');
      if (
        cfg?.imagenameField?.length &&
        tType &&
        cfg.transactionTypeValue &&
        cfg.transactionTypeField &&
        String(getCase(row, cfg.transactionTypeField)) === String(cfg.transactionTypeValue)
      ) {
        newBase = buildNameFromRow(row, cfg.imagenameField);
        if (newBase) {
          folderRaw = `${slugify(String(tType))}/${slugify(String(cfg.transactionTypeValue))}`;
        }
      }
      if (!newBase) {
        const fields = [
          'z_mat_code',
          'or_bcode',
          'bmtr_pmid',
          'pmid',
          'sp_primary_code',
          'pid',
        ];
        const basePart = buildNameFromRow(row, fields);
        const o1 = [getCase(row, 'bmtr_orderid'), getCase(row, 'bmtr_orderdid')]
          .filter(Boolean)
          .join('~');
        const o2 = [getCase(row, 'ordrid'), getCase(row, 'ordrdid')]
          .filter(Boolean)
          .join('~');
        const ord = o1 || o2;
        if (ord && tType && transTypeVal) {
          const parts = [];
          if (basePart) parts.push(basePart);
          parts.push(ord, transTypeVal, tType);
          newBase = sanitizeName(parts.join('_'));
          folderRaw = `${slugify(String(tType))}/${slugify(String(transTypeVal))}`;
        }
      }
      if (!newBase && numField) {
        newBase = sanitizeName(String(row[numField]));
        folderRaw = buildFolderName(row, cfg?.imageFolder || entry.name);
      }
      if (!newBase) continue;
      incompleteFound += 1;
      const folderDisplay = '/' + String(folderRaw).replace(/^\/+/, '');
      const sanitizedUnique = sanitizeName(unique);
      let finalBase = newBase;
      if (unique) {
        if (sanitizeName(newBase).includes(sanitizedUnique)) {
          finalBase = `${newBase}${suffix}`;
        } else {
          finalBase = `${newBase}_${unique}${suffix}`;
        }
      }
      const newName = `${finalBase}${ext}`;
      count += 1;
      if (count > offset && results.length < perPage) {
        results.push({
          folder: folderRaw,
          folderDisplay,
          currentName: f,
          newName,
          currentPath: path.join(dirPath, f),
        });
      } else if (results.length >= perPage) {
        hasMore = true;
        break;
      }
    }
    if (hasMore) break;
  }
  return { list: results, hasMore, summary: { totalFiles, folders: Array.from(folders), incompleteFound, processed: results.length } };
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

export async function checkUploadedImages(files = [], names = []) {
  const results = [];
  let processed = 0;
  const limit = 1000;
  let items = files.length ? files : names.map((n) => ({ originalname: n }));
  items = items.slice(0, limit);
  for (const file of items) {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || '', ext);
    const parts = base.split('_');
    const isSave = /_\d{13}_[a-z0-9]{6}$/i.test(base);
    let unique = '';
    let suffix = '';
    let found;
    if (isSave) {
      const [inv, sp, transType, ts] = parts;
      found = await findTxnByParts(inv, sp, transType, Number(ts));
    } else {
      ({ unique, suffix } = parseFileUnique(base));
      if (!unique) continue;
      found = await findTxnByUniqueId(unique);
    }
    if (!found) continue;
    const { row, configs, numField } = found;
    const cfg = pickConfig(configs, row);
    let newBase = '';
    let folderRaw = '';
    const tType =
      getCase(row, 'trtype') ||
      getCase(row, 'UITrtype') ||
      getCase(row, 'TRTYPENAME') ||
      getCase(row, 'trtypename') ||
      getCase(row, 'uitranstypename') ||
      getCase(row, 'transtype');
    const transTypeVal =
      getCase(row, 'TransType') ||
      getCase(row, 'UITransType') ||
      getCase(row, 'UITransTypeName') ||
      getCase(row, 'transtype');
    if (
      cfg?.imagenameField?.length &&
      tType &&
      cfg.transactionTypeValue &&
      cfg.transactionTypeField &&
      String(getCase(row, cfg.transactionTypeField)) === String(cfg.transactionTypeValue)
    ) {
      newBase = buildNameFromRow(row, cfg.imagenameField);
      if (newBase) {
        folderRaw = `${slugify(String(tType))}/${slugify(String(cfg.transactionTypeValue))}`;
      }
    }
    if (!newBase) {
      const fields = [
        'z_mat_code',
        'or_bcode',
        'bmtr_pmid',
        'pmid',
        'sp_primary_code',
        'pid',
      ];
      const basePart = buildNameFromRow(row, fields);
      const o1 = [getCase(row, 'bmtr_orderid'), getCase(row, 'bmtr_orderdid')]
        .filter(Boolean)
        .join('~');
      const o2 = [getCase(row, 'ordrid'), getCase(row, 'ordrdid')]
        .filter(Boolean)
        .join('~');
      const ord = o1 || o2;
      if (ord && tType && transTypeVal) {
        const partsArr = [];
        if (basePart) partsArr.push(basePart);
        partsArr.push(ord, transTypeVal, tType);
        newBase = sanitizeName(partsArr.join('_'));
        folderRaw = `${slugify(String(tType))}/${slugify(String(transTypeVal))}`;
      }
    }
    if (!newBase && numField) {
      newBase = sanitizeName(String(row[numField]));
      folderRaw = buildFolderName(row, cfg?.imageFolder || found.table);
    }
    if (!newBase) continue;
    processed += 1;
    const folderDisplay = '/' + String(folderRaw).replace(/^\/+/, '');
    const sanitizedUnique = sanitizeName(unique);
    let finalBase = newBase;
    if (unique) {
      if (sanitizeName(newBase).includes(sanitizedUnique)) {
        finalBase = `${newBase}${suffix}`;
      } else {
        finalBase = `${newBase}_${unique}${suffix}`;
      }
    }
    const newName = `${finalBase}${ext}`;
    results.push({
      tmpPath: file.path,
      originalName: file.originalname,
      newName,
      folder: folderRaw,
      folderDisplay,
      id: file.path || file.originalname,
    });
  }
  return { list: results, summary: { totalFiles: items.length, processed } };
}

export async function commitUploadedImages(list = []) {
  const { baseDir } = await getDirs();
  let count = 0;
  for (const item of list) {
    const dir = path.join(baseDir, item.folder || '');
    ensureDir(dir);
    try {
      await fs.rename(item.tmpPath, path.join(dir, item.newName));
      count += 1;
    } catch {}
  }
  return count;
}
