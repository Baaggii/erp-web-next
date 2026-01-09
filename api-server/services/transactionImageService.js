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

async function getDirs(companyId = 0) {
  const { config: cfg } = await getGeneralConfig(companyId);
  const subdir = cfg.general?.imageDir || 'txn_images';
  const rootBase = cfg.images?.basePath || 'uploads';
  const baseName = path.basename(rootBase);
  const companySeg = String(companyId || 0);
  const baseRoot = path.isAbsolute(rootBase)
    ? path.join(rootBase, companySeg)
    : path.join(projectRoot, rootBase, companySeg);
  const baseDir = path.join(baseRoot, subdir);
  const ignore = (cfg.images?.ignoreOnSearch || [])
    .map((s) => path.basename(String(s)).toLowerCase())
    .filter((s) => s && s !== baseName.toLowerCase());
  const urlBase = `/api/${baseName}/${companySeg}/${subdir}`;
  return {
    baseDir,
    baseRoot,
    urlBase,
    basePath: path.join(baseName, companySeg),
    ignore,
  };
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

function stripUploaderTag(value = '') {
  return String(value).replace(/__u[^_]+__$/i, '');
}

function extractImagePrefix(base) {
  const normalized = String(base || '');
  if (!normalized) return '';
  const save = parseSaveName(normalized);
  if (save?.pre) {
    return stripUploaderTag(save.pre || '');
  }
  const savedMatch = normalized.match(
    /^(.*?)(?:__u[^_]+__)?_[0-9]{13}_[a-z0-9]{6}$/i,
  );
  if (savedMatch?.[1]) {
    return stripUploaderTag(savedMatch[1]);
  }
  const altMatch = normalized.match(/^(.*?)(?:__u[^_]+__)?__([a-z0-9]{6})$/i);
  if (altMatch?.[1]) {
    return stripUploaderTag(altMatch[1]);
  }
  return stripUploaderTag(normalized);
}

function escapeLike(value = '') {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pickImageName(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const keys = ['_imageName', 'imageName', 'image_name', 'imagename'];
  for (const key of keys) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

function extractTempImageName(row) {
  const payload = safeJsonParse(row.payload_json, {});
  const cleanedValues = safeJsonParse(row.cleaned_values_json, {});
  const rawValues = safeJsonParse(row.raw_values_json, {});
  const payloadValues = payload?.values;
  const payloadCleaned = payload?.cleanedValues;
  const payloadRaw = payload?.rawValues;
  return (
    pickImageName(payloadValues) ||
    pickImageName(payloadCleaned) ||
    pickImageName(payloadRaw) ||
    pickImageName(cleanedValues) ||
    pickImageName(rawValues) ||
    ''
  );
}

async function getPromotedRecordIdFromHistory(tempId) {
  if (!tempId) return null;
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT promoted_record_id
         FROM transaction_temporary_review_history
        WHERE temporary_id = ?
          AND action = 'promoted'
          AND promoted_record_id IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [tempId],
    );
  } catch {
    return null;
  }
  return rows?.[0]?.promoted_record_id || null;
}

async function getNumFieldForTable(table) {
  let cols;
  try {
    [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
  } catch {
    return '';
  }
  const numCol = cols.find((c) => c.Field.toLowerCase().includes('num'));
  return numCol ? numCol.Field : '';
}

function resolveTempImageValues(row) {
  const payload = safeJsonParse(row.payload_json, {});
  const cleanedContainer = safeJsonParse(row.cleaned_values_json, {});
  const rawContainer = safeJsonParse(row.raw_values_json, {});
  const cleanedValues = isPlainObject(cleanedContainer?.values)
    ? cleanedContainer.values
    : isPlainObject(cleanedContainer)
    ? cleanedContainer
    : null;
  const payloadCleaned = isPlainObject(payload?.cleanedValues)
    ? payload.cleanedValues
    : null;
  const rawValues = isPlainObject(payload?.values)
    ? payload.values
    : isPlainObject(rawContainer)
    ? rawContainer
    : null;
  return {
    payload,
    cleanedValues,
    rawValues,
    mergedValues: {
      ...(rawValues || {}),
      ...(cleanedValues || {}),
      ...(payloadCleaned || {}),
    },
  };
}

function applyImageIdFallback(values, config, promotedRecordId) {
  if (!promotedRecordId || !config?.imageIdField) return values;
  const current = getCase(values, config.imageIdField);
  if (current != null && current !== '') return values;
  return { ...values, [config.imageIdField]: promotedRecordId };
}

async function findPromotedTempMatch(imagePrefix, companyId = 0) {
  if (!imagePrefix) return null;
  const normalizedPrefix = sanitizeName(imagePrefix);
  const escaped = escapeLike(imagePrefix);
  const like = `%${escaped}%`;
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT id, table_name, promoted_record_id, payload_json, raw_values_json, cleaned_values_json
         FROM transaction_temporaries
        WHERE company_id = ?
          AND status = 'promoted'
          AND (
            payload_json LIKE ? ESCAPE '\\\\'
            OR cleaned_values_json LIKE ? ESCAPE '\\\\'
            OR raw_values_json LIKE ? ESCAPE '\\\\'
          )
        ORDER BY updated_at DESC
        LIMIT 20`,
      [companyId, like, like, like],
    );
  } catch {
    return null;
  }
  for (const row of rows || []) {
    const { mergedValues } = resolveTempImageValues(row);
    const { config: cfgs } = await getConfigsByTable(row.table_name, companyId).catch(
      () => ({ config: {} }),
    );
    const cfg = pickConfig(cfgs, mergedValues);
    let promotedRecordId = row.promoted_record_id || null;
    if (!promotedRecordId) {
      promotedRecordId = await getPromotedRecordIdFromHistory(row.id);
    }
    if (!promotedRecordId) continue;
    const withFallback = applyImageIdFallback(mergedValues, cfg, promotedRecordId);
    const resolvedFromValues = resolveImageNaming(
      withFallback,
      cfg,
      row.table_name,
    );
    const candidates = new Set(
      [
        extractTempImageName(row),
        resolvedFromValues.name,
        withFallback?._imageName,
        withFallback?.imageName,
        withFallback?.image_name,
      ]
        .filter((val) => typeof val === 'string' && val.trim())
        .map((val) => sanitizeName(val)),
    );
    const matches = Array.from(candidates).some(
      (candidate) =>
        candidate === normalizedPrefix ||
        candidate.startsWith(`${normalizedPrefix}_`) ||
        normalizedPrefix.startsWith(`${candidate}_`),
    );
    if (!matches) continue;
    let promotedRows;
    try {
      [promotedRows] = await pool.query(
        `SELECT * FROM \`${row.table_name}\` WHERE id = ? LIMIT 1`,
        [promotedRecordId],
      );
    } catch {
      continue;
    }
    const promotedRow = promotedRows?.[0];
    if (!promotedRow) continue;
    const numField = await getNumFieldForTable(row.table_name);
    return {
      table: row.table_name,
      row: promotedRow,
      configs: cfgs,
      numField,
      tempPromoted: true,
      promotedRecordId,
    };
  }
  return null;
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

export function resolveImageNaming(row = {}, config = {}, fallbackTable = '') {
  const imagenameFields = Array.isArray(config?.imagenameField)
    ? config.imagenameField
    : [];
  const imageIdField =
    typeof config?.imageIdField === 'string' ? config.imageIdField : '';
  const combinedFields = Array.from(
    new Set([...imagenameFields, imageIdField].filter(Boolean)),
  );
  let name = '';
  if (combinedFields.length) {
    name = buildNameFromRow(row, combinedFields);
  }
  if (!name && imagenameFields.length) {
    name = buildNameFromRow(row, imagenameFields);
  }
  if (!name && imageIdField) {
    name = buildNameFromRow(row, [imageIdField]);
  }
  if (!name) {
    const fallback =
      getCase(row, '_imageName') ||
      getCase(row, 'imagename') ||
      getCase(row, 'image_name') ||
      getCase(row, 'ImageName') ||
      '';
    name = sanitizeName(fallback || '');
  }
  const folder = buildFolderName(row, config?.imageFolder || fallbackTable);
  return { name, folder };
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

async function findTxnByParts(inv, sp, transType, timestamp, companyId = 0) {
  let tables;
  try {
    [tables] = await pool.query("SHOW TABLES LIKE 'transactions_%'");
  } catch {
    return null;
  }

  const { configs: cfgMatches } = await getConfigsByTransTypeValue(
    transType,
    companyId,
  );
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
        const { config } = await getConfigsByTable(tbl, companyId);
        cfgs = config;
      } catch {}
      return { table: tbl, row: rowObj, configs: cfgs, numField: transCol.Field };
    }
  }
  return null;
}

export async function saveImages(
  table,
  name,
  files,
  folder = null,
  companyId = 0,
  uploaderId = null,
) {
  const { baseDir, urlBase } = await getDirs(companyId);
  ensureDir(baseDir);
  const dir = path.join(baseDir, folder || table);
  ensureDir(dir);
  const saved = [];
  const prefix = sanitizeName(name);
  const uploaderTag = uploaderId ? `__u${sanitizeName(uploaderId)}__` : '';
  let mimeLib;
  try {
    mimeLib = (await import('mime-types')).default;
  } catch {}
  for (const file of files) {
    const ext =
      path.extname(file.originalname) || `.${mimeLib?.extension(file.mimetype) || 'bin'}`;
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${prefix}${uploaderTag}_${unique}${ext}`;
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

export async function listImages(table, name, folder = null, companyId = 0) {
  const { baseDir, urlBase } = await getDirs(companyId);
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

export async function renameImages(
  table,
  oldName,
  newName,
  folder = null,
  companyId = 0,
  sourceFolder = null,
) {
  const { baseDir, urlBase } = await getDirs(companyId);
  ensureDir(baseDir);
  const dir = path.join(baseDir, table);
  ensureDir(dir);
  const targetDir = folder ? path.join(baseDir, folder) : dir;
  ensureDir(targetDir);
  const sourceDir = sourceFolder ? path.join(baseDir, sourceFolder) : null;
  const oldPrefix = sanitizeName(oldName);
  const newPrefix = sanitizeName(newName);
  try {
    const searchDirs = folder ? [dir, targetDir] : [dir];
    if (sourceDir && sourceDir !== dir && sourceDir !== targetDir) {
      searchDirs.push(sourceDir);
    }
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
          if (src !== dest) {
            await fs.rename(src, dest);
          }
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

export async function searchImages(term, page = 1, perPage = 20, companyId = 0) {
  const { baseDir, urlBase, ignore } = await getDirs(companyId);
  ensureDir(baseDir);
  const safe = sanitizeName(term);
  const regex = new RegExp(`(^|[\\-_~])${safe}([\\-_~]|$)`, 'i');
  const list = [];

  async function walk(dir, rel = '') {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (ignore.includes(entry.name.toLowerCase())) continue;
        await walk(full, relPath);
      } else if (regex.test(entry.name)) {
        list.push(`${urlBase}/${relPath.replace(/\\\\/g, '/')}`);
      }
    }
  }

  await walk(baseDir);
  const total = list.length;
  const start = (page - 1) * perPage;
  const files = list.slice(start, start + perPage);
  return { files, total };
}

export async function moveImagesToDeleted(table, row = {}, companyId = 0) {
  let configs = {};
  try {
    const { config } = await getConfigsByTable(table, companyId);
    configs = config;
  } catch {}
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
      const renamed = await renameImages(
        src,
        name,
        name,
        'deleted_transactions',
        companyId,
      );
      moved += renamed.length;
    }
  }
  return moved;
}

function extractUploaderFromFilename(file) {
  const match = String(file || '').match(/__u([^_]+?)__/i);
  return match ? match[1] : null;
}

export async function deleteImage(
  table,
  file,
  folder = null,
  companyId = 0,
  requesterEmpId = null,
) {
  const { baseDir } = await getDirs(companyId);
  const dir = path.join(baseDir, folder || table);
  const targetDir = path.join(baseDir, 'deleted_images');
  ensureDir(targetDir);
  try {
    if (requesterEmpId) {
      const uploader = extractUploaderFromFilename(file);
      if (uploader && sanitizeName(uploader) !== sanitizeName(requesterEmpId)) {
        return false;
      }
    }
    const src = path.join(dir, path.basename(file));
    const dest = path.join(targetDir, path.basename(file));
    await fs.rename(src, dest).catch(async () => {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllImages(table, name, folder = null, companyId = 0) {
  const { baseDir } = await getDirs(companyId);
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

export async function cleanupOldImages(days = 30, companyId = 0) {
  const { baseDir, basePath } = await getDirs(companyId);
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

export async function detectIncompleteImages(
  page = 1,
  perPage = 100,
  companyId = 0,
  signal,
) {
  const { baseDir } = await getDirs(companyId);
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
    signal?.throwIfAborted();
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
      signal?.throwIfAborted();
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
          companyId,
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
        found = await findTxnByUniqueId(unique, companyId);
      }
      if (!found) {
        const tempPrefix = extractImagePrefix(base);
        const tempMatch = await findPromotedTempMatch(tempPrefix, companyId);
        if (tempMatch) {
          found = tempMatch;
        }
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
      const { row, configs, numField, tempPromoted, promotedRecordId } = found;

      const cfg = pickConfig(configs, row);
      let newBase = '';
      let folderRaw = '';
      if (tempPromoted) {
        const namingSource = applyImageIdFallback(row, cfg, promotedRecordId);
        const resolved = resolveImageNaming(
          namingSource,
          cfg,
          found.table || entry.name,
        );
        if (resolved.name) {
          newBase = resolved.name;
          folderRaw = resolved.folder;
        }
      }
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

async function findTxnByUniqueId(idPart, companyId = 0) {
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
        const { config } = await getConfigsByTable(tbl, companyId);
        cfgs = config;
      } catch {}
      return { table: tbl, row: rows[0], configs: cfgs, numField: numCol.Field };
    }
  }
  return null;
}

export async function fixIncompleteImages(list = [], companyId = 0) {
  const { baseDir } = await getDirs(companyId);
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

export async function checkUploadedImages(
  files = [],
  names = [],
  companyId = 0,
  signal,
) {
  const results = [];
  let processed = 0;
  const codes = await fetchTxnCodes();
  const { baseDir, baseRoot, ignore } = await getDirs(companyId);
  let items = files.length
    ? files
    : names.map((n) => ({
        originalname: typeof n === 'string' ? n : n?.name || String(n),
        index: n?.index,
      }));
  for (const file of items) {
    signal?.throwIfAborted();
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || '', ext);
    let unique = '';
    let suffix = '';
    let found;
    let reason = '';
    const save = parseSaveName(base);
    if (save) {
      ({ unique } = save);
      suffix = `__${save.ts}_${save.rand}`;
      if (hasTxnCode(base, unique, codes)) {
        reason = 'Already renamed';
      } else {
        found = await findTxnByParts(
          save.inv,
          save.sp,
          save.transType,
          Number(save.ts),
          companyId,
        );
      }
    } else {
      ({ unique, suffix } = parseFileUnique(base));
      if (!unique) {
        reason = 'Invalid filename';
      } else if (hasTxnCode(base, unique, codes)) {
        reason = 'Already renamed';
      } else {
        found = await findTxnByUniqueId(unique, companyId);
      }
    }
    if (!reason && !found) reason = 'Transaction not found';
    if (found && !reason) {
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
      if (!newBase) {
        reason = 'Could not build new name';
      } else {
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
        const target = path.join(baseDir, folderRaw, newName);
        let exists = fssync.existsSync(target);
        if (!exists && Array.isArray(ignore)) {
          for (const ig of ignore) {
            if (!ig) continue;
            const alt1 = path.join(baseRoot, ig, newName);
            const alt2 = path.join(baseRoot, ig, folderRaw, newName);
            if (fssync.existsSync(alt1) || fssync.existsSync(alt2)) {
              exists = true;
              break;
            }
          }
        }
        if (exists) {
          results.push({
            originalName: file.originalname,
            newName,
            folder: folderRaw,
            folderDisplay,
            id: file.path || file.originalname,
            index: file.index,
            processed: true,
            reason: 'Exists in ignored path',
          });
          continue;
        }
        results.push({
          tmpPath: file.path,
          originalName: file.originalname,
          newName,
          folder: folderRaw,
          folderDisplay,
          id: file.path || file.originalname,
          index: file.index,
        });
        continue;
      }
    }
    results.push({
      originalName: file.originalname,
      index: file.index,
      reason: reason || 'No match found',
    });
  }
  return { list: results, summary: { totalFiles: items.length, processed } };
}

export async function commitUploadedImages(list = [], companyId = 0, signal) {
  const { baseDir } = await getDirs(companyId);
  let count = 0;
  for (const item of list) {
    signal?.throwIfAborted();
    const dir = path.join(baseDir, item.folder || '');
    ensureDir(dir);
    try {
      await fs.rename(item.tmpPath, path.join(dir, item.newName));
      count += 1;
    } catch {}
  }
  return count;
}

export async function detectIncompleteFromNames(names = [], companyId = 0, signal) {
  const codes = await fetchTxnCodes();
  const results = [];
  const skipped = [];
  let processed = 0;
  for (const name of names) {
    signal?.throwIfAborted();
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
