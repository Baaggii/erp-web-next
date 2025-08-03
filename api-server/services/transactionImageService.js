import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGeneralConfig } from './generalConfig.js';
import { pool } from '../../db/index.js';
import { getConfigsByTable, getConfigsByTransTypeValue } from './transactionFormConfig.js';
import { slugify } from '../utils/slugify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

async function getDirs() {
  const cfg = await getGeneralConfig();
  const subdir = cfg.general?.imageDir || 'txn_images';
  const basePath = cfg.general?.imageStorage?.basePath || 'uploads';
  const baseDir = path.isAbsolute(basePath)
    ? path.join(basePath, subdir)
    : path.join(projectRoot, basePath, subdir);
  const baseName = path.basename(basePath);
  const urlBase = `/api/${baseName}/${subdir}`;
  return { baseDir, urlBase, basePath: baseName };
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

function parseSaveName(base) {
  const m = base.match(
    /^(.*?)(?:_(\d{13})_([a-z0-9]{6})|__([a-z0-9]{6}))$/i,
  );
  if (!m) return null;
  const pre = m[1];
  const ts = m[2] || '';
  const rand = m[3] || m[4] || '';
  const segs = pre.split('_');
  const inv = segs.shift() || '';
  let sp = '';
  let transType = '';
  if (segs.length >= 2) {
    sp = segs.shift();
    transType = segs.shift();
  } else if (segs.length === 1) {
    transType = segs.shift();
  }
  const unique = segs.join('_');
  return { inv, sp, transType, unique, ts, rand, pre };
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

async function fetchTxnCodes() {
  try {
    const [rows] = await pool.query('SELECT UITrtype, UITransType FROM code_transaction');
    const trtypes = (rows || [])
      .map((r) => String(r.UITrtype || '').toLowerCase())
      .filter(Boolean);
    const transTypes = (rows || [])
      .map((r) => String(r.UITransType || ''))
      .filter(Boolean);
    return { trtypes, transTypes };
  } catch {
    return { trtypes: [], transTypes: [] };
  }
}

function hasTxnCode(base, unique, codes) {
  const leftover = base.toLowerCase().replace(unique.toLowerCase(), '');
  const tokens = leftover.split(/[_-]/).filter(Boolean);
  const hasTrtype = tokens.some((t) => codes.trtypes.includes(t));
  const hasTransType = tokens.some((t) => codes.transTypes.includes(t));
  return hasTrtype && hasTransType;
}

export async function findBenchmarkCode(name) {
  if (!name) return null;
  const base = path.basename(name, path.extname(name));
  const parts = base.split(/[_-]/).filter(Boolean);
  for (const p of parts) {
    if (/^\d{4}$/.test(p)) {
      const [rows] = await pool.query(
        'SELECT UITransType FROM code_transaction WHERE UITransType = ?',
        [p],
      );
      if (rows?.length) return rows[0].UITransType;
    }
    if (/^[A-Za-z]{4}$/.test(p)) {
      const [rows] = await pool.query(
        'SELECT UITransType FROM code_transaction WHERE UITrtype = ?',
        [p],
      );
      if (rows?.length) return rows[0].UITransType;
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

  const cfgMatches = await getConfigsByTransTypeValue(transType);
  const cfgMap = new Map(
    cfgMatches.map((m) => [m.table.toLowerCase(), m.config]),
  );

  for (const row of tables || []) {
    const tbl = Object.values(row)[0];
    if (cfgMap.size && !cfgMap.has(tbl.toLowerCase())) continue;
    let cols;
    try {
      [cols] = await pool.query(`SHOW COLUMNS FROM \`${tbl}\``);
    } catch {
      continue;
    }
    const invCol = cols.find((c) =>
      ['inventory_code', 'z_mat_code', 'bmtr_pmid'].includes(
        c.Field.toLowerCase(),
      ),
    );
    const spCol = cols.find((c) => c.Field.toLowerCase() === 'sp_primary_code');
    const transCol = cols.find((c) =>
      ['transtype', 'uitranstype', 'ui_transtype'].includes(
        c.Field.toLowerCase(),
      ),
    );
    if (!invCol || !transCol) continue;
    const cfg = cfgMap.get(tbl.toLowerCase());
    let dateCol;
    if (cfg?.dateField?.length) {
      const lowers = cfg.dateField.map((d) => String(d).toLowerCase());
      dateCol = cols.find((c) => lowers.includes(c.Field.toLowerCase()));
    } else {
      dateCol = cols.find((c) => c.Field.toLowerCase().includes('date'));
    }
    let sql = `SELECT * FROM \`${tbl}\` WHERE \`${invCol.Field}\` = ? AND \`${transCol.Field}\` = ?`;
    const params = [inv, transType];
    if (sp && spCol) {
      sql += ` AND \`${spCol.Field}\` = ?`;
      params.push(sp);
    }
    if (dateCol && timestamp) {
      sql +=
        ` AND ABS(TIMESTAMPDIFF(SECOND, FROM_UNIXTIME(?/1000), \`${dateCol.Field}\`)) < 172800`;
      params.push(timestamp);
    }
    sql += ' LIMIT 1';
    let rows;
    try {
      [rows] = await pool.query(sql, params);
      if (!rows.length && dateCol) {
        let sql2 = `SELECT * FROM \`${tbl}\` WHERE \`${invCol.Field}\` = ? AND \`${transCol.Field}\` = ?`;
        const p2 = [inv, transType];
        if (sp && spCol) {
          sql2 += ` AND \`${spCol.Field}\` = ?`;
          p2.push(sp);
        }
        sql2 += ' LIMIT 1';
        [rows] = await pool.query(sql2, p2);
      }
    } catch {
      continue;
    }
    if (rows.length) {
      const rowObj = rows[0];
      let cfgs = {};
      try {
        cfgs = await getConfigsByTable(tbl);
      } catch {}
      return { table: tbl, row: rowObj, configs: cfgs, numField: transCol.Field };
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
    const searchDirs = folder ? [dir, targetDir] : [dir];
    const results = [];
    const seen = new Set();
    for (const d of searchDirs) {
      const files = await fs.readdir(d).catch(() => []);
      for (const f of files) {
        if (f.startsWith(oldPrefix + '_')) {
          const rest = f.slice(oldPrefix.length);
          const destFile = newPrefix + rest;
          const src = path.join(d, f);
          const dest = path.join(targetDir, destFile);
          await fs.rename(src, dest);
          if (!seen.has(destFile)) {
            const folderPart = folder || table;
            results.push(`${urlBase}/${folderPart}/${destFile}`);
            seen.add(destFile);
          }
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function moveImagesToDeleted(table, row = {}) {
  const configs = await getConfigsByTable(table).catch(() => ({}));
  const cfg = pickConfig(configs, row);
  const names = new Set();
  if (cfg?.imagenameField?.length) {
    const primary = buildNameFromRow(row, cfg.imagenameField);
    if (primary) names.add(primary);
  }
  if (cfg?.imageIdField) {
    const idName = buildNameFromRow(row, [cfg.imageIdField]);
    if (idName) names.add(idName);
  }
  const extra =
    sanitizeName(
      getCase(row, 'imagename') ||
        getCase(row, 'image_name') ||
        getCase(row, 'ImageName') ||
        '',
    ) || '';
  if (extra) names.add(extra);

  const folder = buildFolderName(row, cfg?.imageFolder || table);
  const srcFolders = new Set([table]);
  if (folder && folder !== table) srcFolders.add(folder);
  let moved = 0;
  for (const src of srcFolders) {
    for (const name of names) {
      const renamed = await renameImages(src, name, name, 'deleted_transactions');
      moved += renamed.length;
    }
  }
  return moved;
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
  const { baseDir, basePath } = await getDirs();
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
  await walk(path.join(projectRoot, basePath, 'tmp'));

  return removed;
}

export async function detectIncompleteImages(page = 1, perPage = 100) {
  const { baseDir } = await getDirs();
  const codes = await fetchTxnCodes();
  let results = [];
  const skipped = [];
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
    for (const f of files) {
      const ext = path.extname(f);
      const base = path.basename(f, ext);
      const filePath = path.join(dirPath, f);
      let unique = '';
      let suffix = '';
      let found;
      const save = parseSaveName(base);
      if (save) {
        ({ unique } = save);
        suffix = `__${save.ts}_${save.rand}`;
        if (hasTxnCode(base, unique, codes)) {
          skipped.push({
            currentName: f,
            newName: f,
            folder: entry.name,
            folderDisplay: '/' + entry.name,
            currentPath: filePath,
            reason: 'Contains transaction codes',
          });
          continue;
        }
        found = await findTxnByParts(
          save.inv,
          save.sp,
          save.transType,
          Number(save.ts),
        );
      } else {
        ({ unique, suffix } = parseFileUnique(base));
        if (!unique) {
          skipped.push({
            currentName: f,
            newName: f,
            folder: entry.name,
            folderDisplay: '/' + entry.name,
            currentPath: filePath,
            reason: 'No unique identifier',
          });
          continue;
        }
        if (hasTxnCode(base, unique, codes)) {
          skipped.push({
            currentName: f,
            newName: f,
            folder: entry.name,
            folderDisplay: '/' + entry.name,
            currentPath: filePath,
            reason: 'Contains transaction codes',
          });
          continue;
        }
        found = await findTxnByUniqueId(unique);
      }
      if (!found) {
        skipped.push({
          currentName: f,
          newName: f,
          folder: entry.name,
          folderDisplay: '/' + entry.name,
          currentPath: filePath,
          reason: 'No matching transaction',
        });
        continue;
      }
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
        const partsArr = [];
        const basePart = buildNameFromRow(row, fields);
        if (basePart) partsArr.push(basePart);
        const o1 = [getCase(row, 'bmtr_orderid'), getCase(row, 'bmtr_orderdid')]
          .filter(Boolean)
          .join('~');
        const o2 = [getCase(row, 'ordrid'), getCase(row, 'ordrdid')]
          .filter(Boolean)
          .join('~');
        const ord = o1 || o2;
        if (ord) partsArr.push(ord);
        if (transTypeVal) partsArr.push(transTypeVal);
        if (tType) partsArr.push(tType);
        if (partsArr.length) {
          newBase = sanitizeName(partsArr.join('_'));
          folderRaw = folderRaw || buildFolderName(row, cfg?.imageFolder || entry.name);
        }
      }
      if (!newBase && numField) {
        newBase = sanitizeName(String(row[numField]));
        folderRaw = buildFolderName(row, cfg?.imageFolder || entry.name);
      }
      if (!newBase) {
        skipped.push({
          currentName: f,
          newName: f,
          folder: entry.name,
          folderDisplay: '/' + entry.name,
          currentPath: filePath,
          reason: 'No rename mapping',
        });
        continue;
      }
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
      } else if (suffix) {
        finalBase = `${newBase}${suffix}`;
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
  return {
    list: results,
    skipped,
    hasMore,
    summary: {
      totalFiles,
      folders: Array.from(folders),
      incompleteFound,
      processed: results.length,
      skipped: skipped.length,
    },
  };
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
  const codes = await fetchTxnCodes();
  const limit = 1000;
  let items = files.length
    ? files
    : names.map((n) => ({ originalname: typeof n === 'string' ? n : n?.name || String(n) }));
  items = items.slice(0, limit);
    for (const file of items) {
      const ext = path.extname(file.originalname || '');
      const base = path.basename(file.originalname || '', ext);
      let unique = '';
      let suffix = '';
      let found;
      const save = parseSaveName(base);
      if (save) {
        ({ unique } = save);
        suffix = `__${save.ts}_${save.rand}`;
        if (hasTxnCode(base, unique, codes)) continue;
        found = await findTxnByParts(
          save.inv,
          save.sp,
          save.transType,
          Number(save.ts),
        );
      } else {
        ({ unique, suffix } = parseFileUnique(base));
        if (!unique) continue;
        if (hasTxnCode(base, unique, codes)) continue;
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
      const partsArr = [];
      const basePart = buildNameFromRow(row, fields);
      if (basePart) partsArr.push(basePart);
      const o1 = [getCase(row, 'bmtr_orderid'), getCase(row, 'bmtr_orderdid')]
        .filter(Boolean)
        .join('~');
      const o2 = [getCase(row, 'ordrid'), getCase(row, 'ordrdid')]
        .filter(Boolean)
        .join('~');
      const ord = o1 || o2;
      if (ord) partsArr.push(ord);
      if (transTypeVal) partsArr.push(transTypeVal);
      if (tType) partsArr.push(tType);
      if (partsArr.length) {
        newBase = sanitizeName(partsArr.join('_'));
        folderRaw = folderRaw || buildFolderName(row, cfg?.imageFolder || found.table);
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
    } else if (suffix) {
      finalBase = `${newBase}${suffix}`;
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

export async function detectIncompleteFromNames(names = []) {
  const codes = await fetchTxnCodes();
  const results = [];
  const skipped = [];
  let processed = 0;
  for (const name of names) {
    const ext = path.extname(name || '');
    const base = path.basename(name || '', ext);
    const { unique } = parseFileUnique(base);
    if (!unique) {
      skipped.push({ originalName: name, reason: 'No unique identifier' });
      continue;
    }
    if (hasTxnCode(base, unique, codes)) {
      skipped.push({ originalName: name, reason: 'Contains transaction codes' });
      continue;
    }
    results.push({ originalName: name });
    processed += 1;
  }
  return {
    list: results,
    skipped,
    summary: { totalFiles: names.length, processed, skipped: skipped.length },
  };
}
