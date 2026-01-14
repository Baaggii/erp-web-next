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
let sharpLoader;
let heicConvertLoader;

async function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((mod) => mod.default)
      .catch(() => null);
  }
  return sharpLoader;
}

async function loadHeicConvert() {
  if (!heicConvertLoader) {
    heicConvertLoader = import('heic-convert')
      .then((mod) => mod.default || mod)
      .catch(() => null);
  }
  return heicConvertLoader;
}

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

function normalizeSavePath(savePath = '') {
  let raw = String(savePath || '').trim();
  if (!raw) return '';
  const decodePath = (value) => {
    let decoded = value;
    for (let i = 0; i < 2; i += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }
    return decoded;
  };
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      pathname = raw;
    }
  }
  pathname = pathname.split('?')[0];
  pathname = decodePath(pathname);
  pathname = pathname.replace(/\\/g, '/').replace(/^\/+/, '');
  const apiIndex = pathname.indexOf('api/');
  if (apiIndex > 0) {
    pathname = pathname.slice(apiIndex);
  }
  if (pathname.startsWith('api/')) {
    pathname = pathname.slice(4);
  }
  return pathname;
}

async function resolveSafeImagePath(savePath, companyId = 0) {
  const { baseRoot, basePath } = await getDirs(companyId);
  const normalized = normalizeSavePath(savePath);
  if (!normalized) return null;
  const basePrefix = basePath.replace(/\\/g, '/');
  if (!normalized.startsWith(`${basePrefix}/`)) return null;
  const rel = normalized.slice(basePrefix.length + 1);
  if (!rel || rel.includes('..')) return null;
  const resolvedBase = path.resolve(baseRoot);
  const resolvedPath = path.resolve(baseRoot, rel);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    return null;
  }
  return { abs: resolvedPath, rel, baseRoot };
}

function ensureDir(dir) {
  if (!fssync.existsSync(dir)) {
    fssync.mkdirSync(dir, { recursive: true });
  }
}

function isHeicFile(fileName = '', mimeType = '') {
  const ext = path.extname(String(fileName)).toLowerCase();
  const normalizedMime = String(mimeType).toLowerCase();
  return (
    ext === '.heic' ||
    ext === '.heif' ||
    normalizedMime.includes('heic') ||
    normalizedMime.includes('heif')
  );
}

async function ensureJpegForHeic(
  filePath,
  fileName = '',
  mimeType = '',
  conversionIssues = [],
) {
  const nameForCheck = fileName || filePath;
  if (!isHeicFile(nameForCheck, mimeType)) return null;
  const jpgPath = filePath.replace(/\.(heic|heif)$/i, '.jpg');
  if (fssync.existsSync(jpgPath)) return jpgPath;
  if (!fssync.existsSync(filePath)) {
    conversionIssues.push({ file: fileName || path.basename(filePath), reason: 'file missing' });
    return null;
  }
  const sharpLib = await loadSharp();
  let sharpFailed = false;
  let lastSharpError;
  try {
    if (!sharpLib) {
      sharpFailed = true;
    } else {
      try {
        await sharpLib(filePath).metadata();
      } catch (err) {
        sharpFailed = true;
        lastSharpError = err;
      }
      if (!sharpFailed) {
        await sharpLib(filePath).jpeg({ quality: 80 }).toFile(jpgPath);
        const { size } = await fs.stat(jpgPath);
        if (!size) {
          await fs.unlink(jpgPath).catch(() => {});
          conversionIssues.push({
            file: fileName || path.basename(filePath),
            reason: 'write error',
            detail: 'empty output',
          });
          return null;
        }
        return jpgPath;
      }
    }
  } catch (err) {
    sharpFailed = true;
    lastSharpError = err;
  }
  if (sharpFailed) {
    const heicConvert = await loadHeicConvert();
    if (!heicConvert) {
      conversionIssues.push({
        file: fileName || path.basename(filePath),
        reason: 'decode error',
        detail: lastSharpError?.message || String(lastSharpError || 'heic converter unavailable'),
      });
      return null;
    }
    try {
      const inputBuffer = await fs.readFile(filePath);
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.8,
      });
      await fs.writeFile(jpgPath, outputBuffer);
      const { size } = await fs.stat(jpgPath);
      if (!size) {
        await fs.unlink(jpgPath).catch(() => {});
        conversionIssues.push({
          file: fileName || path.basename(filePath),
          reason: 'write error',
          detail: 'empty output',
        });
        return null;
      }
      return jpgPath;
    } catch (err) {
      conversionIssues.push({
        file: fileName || path.basename(filePath),
        reason: 'write error',
        detail: err?.message || String(err),
      });
      return null;
    }
  }
  return null;
}

export async function getThumbnailPath(savePath, companyId = 0, size = 240) {
  const resolved = await resolveSafeImagePath(savePath, companyId);
  if (!resolved) return null;
  let sourcePath = resolved.abs;
  let rel = resolved.rel;
  const wasHeic = isHeicFile(sourcePath);
  if (wasHeic) {
    const converted = await ensureJpegForHeic(sourcePath, path.basename(sourcePath), '');
    if (converted) {
      sourcePath = converted;
      rel = path.relative(resolved.baseRoot, converted);
    }
  }
  const sourceStat = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStat) return null;
  if (wasHeic && isHeicFile(sourcePath)) return sourcePath;
  const thumbRoot = path.join(resolved.baseRoot, 'thumbnails');
  const thumbPath = path.join(thumbRoot, rel);
  ensureDir(path.dirname(thumbPath));
  const thumbStat = await fs.stat(thumbPath).catch(() => null);
  if (thumbStat && thumbStat.mtimeMs >= sourceStat.mtimeMs) {
    return thumbPath;
  }
  const sharpLib = await loadSharp();
  if (!sharpLib) return sourcePath;
  let pipeline = sharpLib(sourcePath).resize({ width: size, height: size, fit: 'cover' });
  const ext = path.extname(thumbPath).toLowerCase();
  if (ext === '.png') {
    pipeline = pipeline.png({ quality: 80 });
  } else if (ext === '.webp') {
    pipeline = pipeline.webp({ quality: 80 });
  } else {
    pipeline = pipeline.jpeg({ quality: 80 });
  }
  await pipeline.toFile(thumbPath);
  return thumbPath;
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

function pickMatchingConfigs(configs = {}, row = {}) {
  const matches = [];
  for (const [name, cfg] of Object.entries(configs)) {
    if (!cfg.transactionTypeValue) continue;
    if (cfg.transactionTypeField) {
      const val = getCase(row, cfg.transactionTypeField);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        matches.push({ name, config: cfg });
      }
    } else {
      const matchField = Object.keys(row).find(
        (k) => String(getCase(row, k)) === String(cfg.transactionTypeValue),
      );
      if (matchField) {
        matches.push({
          name,
          config: { ...cfg, transactionTypeField: matchField },
        });
      }
    }
  }
  return matches;
}

function dedupeFields(fields = []) {
  const seen = new Set();
  const deduped = [];
  fields.forEach((field) => {
    if (!field) return;
    const key = String(field);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(field);
  });
  return deduped;
}

function collectImageFields(entries = [], { includeImageId = true } = {}) {
  const fieldSet = new Set();
  const configNames = [];
  entries.forEach(({ name, config }) => {
    if (name) configNames.push(name);
    if (Array.isArray(config?.imagenameField)) {
      config.imagenameField.forEach((field) => {
        if (field) fieldSet.add(field);
      });
    }
    if (
      includeImageId &&
      typeof config?.imageIdField === 'string' &&
      config.imageIdField
    ) {
      fieldSet.add(config.imageIdField);
    }
  });
  return { fields: Array.from(fieldSet), configNames };
}

function collectAllConfigImageFields(configs = {}, options = {}) {
  const entries = Object.entries(configs || {}).map(([name, config]) => ({
    name,
    config,
  }));
  return collectImageFields(entries, options);
}

function pickConfigEntry(configs = {}, row = {}) {
  for (const [name, cfg] of Object.entries(configs)) {
    if (!cfg.transactionTypeValue) continue;
    if (cfg.transactionTypeField) {
      const val = getCase(row, cfg.transactionTypeField);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        return { name, config: cfg };
      }
    } else {
      const matchField = Object.keys(row).find(
        (k) => String(getCase(row, k)) === String(cfg.transactionTypeValue),
      );
      if (matchField) {
        return { name, config: { ...cfg, transactionTypeField: matchField } };
      }
    }
  }
  const [fallbackName, fallbackConfig] = Object.entries(configs)[0] || [];
  return { name: fallbackName || '', config: fallbackConfig || {} };
}

function pickConfig(configs = {}, row = {}) {
  return pickConfigEntry(configs, row).config;
}

function resolveImageNamingForSearch(row = {}, configs = {}, fallbackTable = '') {
  const { name: preferredName, config: preferredConfig } = pickConfigEntry(configs, row);
  const hasConfigs = Object.keys(configs || {}).length > 0;
  const preferredFields = Array.isArray(preferredConfig?.imagenameField)
    ? preferredConfig.imagenameField
    : [];
  const preferredImageIdField =
    typeof preferredConfig?.imageIdField === 'string' ? preferredConfig.imageIdField : '';
  const preferredFieldSet = dedupeFields([
    ...preferredFields,
    preferredImageIdField,
  ]);
  let name = '';
  let configNames = [];
  const hasPreferredFields = preferredFieldSet.length > 0;
  if (hasPreferredFields) {
    name = buildNameFromRow(row, preferredFieldSet);
    if (name && preferredName) {
      configNames = [preferredName];
    }
  }
  if (!name) {
    const matchedConfigs = pickMatchingConfigs(configs, row);
    const { fields, configNames: matchedNames } = collectImageFields(matchedConfigs);
    if (fields.length) {
      name = buildNameFromRow(row, fields);
      if (name) {
        configNames = matchedNames;
      }
    }
  }
  if (!name && !hasPreferredFields) {
    const { fields, configNames: allNames } = collectAllConfigImageFields(configs);
    if (fields.length) {
      name = buildNameFromRow(row, fields);
      if (name) {
        configNames = allNames;
      }
    }
  }
  const folder = buildFolderName(row, preferredConfig?.imageFolder || fallbackTable);
  return { name, folder, configNames };
}

function resolveImagePrefixForSearch(row = {}, configs = {}, fallbackTable = '') {
  const { name: preferredName, config: preferredConfig } = pickConfigEntry(configs, row);
  const hasConfigs = Object.keys(configs || {}).length > 0;
  const preferredFields = Array.isArray(preferredConfig?.imagenameField)
    ? preferredConfig.imagenameField
    : [];
  let name = '';
  let configNames = [];
  const hasPreferredFields = preferredFields.length > 0;
  if (hasPreferredFields) {
    name = buildNameFromRow(row, preferredFields);
    if (name && preferredName) {
      configNames = [preferredName];
    }
  }
  if (!name) {
    const matchedConfigs = pickMatchingConfigs(configs, row);
    const { fields, configNames: matchedNames } = collectImageFields(
      matchedConfigs,
      { includeImageId: false },
    );
    if (fields.length) {
      name = buildNameFromRow(row, fields);
      if (name) {
        configNames = matchedNames;
      }
    }
  }
  if (!name && !hasPreferredFields) {
    const { fields, configNames: allNames } = collectAllConfigImageFields(configs, {
      includeImageId: false,
    });
    if (fields.length) {
      name = buildNameFromRow(row, fields);
      if (name) {
        configNames = allNames;
      }
    }
  }
  const folder = buildFolderName(row, preferredConfig?.imageFolder || fallbackTable);
  return { name, folder, configNames };
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

function parseSaveSuffix(base) {
  const match = base.match(/_(\d{13})_([a-z0-9]{6})$/i);
  if (!match) return null;
  return { ts: match[1], rand: match[2], suffix: `_${match[1]}_${match[2]}` };
}

function stripUploaderTag(value = '') {
  return String(value).replace(/__u[^_]+__$/i, '');
}

function isTemporaryGeneratedName(base = '') {
  const value = String(base);
  return /^tmp[_-]/i.test(value) || /__u[a-z0-9]+__/i.test(value);
}

function extractImagePrefix(base) {
  const save = parseSaveName(base);
  if (!save) return '';
  return stripUploaderTag(save.pre || '');
}

function splitImageBase(base = '') {
  const save = parseSaveName(base);
  if (save) {
    const suffix = save.ts
      ? `_${save.ts}_${save.rand}`
      : save.rand
        ? `__${save.rand}`
        : '';
    return { baseName: save.pre || '', suffix };
  }
  const saveSuffix = parseSaveSuffix(base);
  if (saveSuffix) {
    return {
      baseName: base.slice(0, -saveSuffix.suffix.length),
      suffix: saveSuffix.suffix,
    };
  }
  return { baseName: base, suffix: '' };
}

function collectImageIdFields(configs = {}) {
  const fields = new Set();
  Object.values(configs || {}).forEach((cfg) => {
    if (typeof cfg?.imageIdField === 'string' && cfg.imageIdField) {
      fields.add(cfg.imageIdField);
    }
  });
  return Array.from(fields);
}

function buildIdCandidates(value = '') {
  const cleaned = sanitizeName(stripUploaderTag(value || ''));
  if (!cleaned) return [];
  const parts = cleaned.split('_').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return dedupeFields([cleaned, last].filter(Boolean));
}

async function getTableColumns(table) {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
    return cols.map((c) => c.Field);
  } catch {
    return [];
  }
}

function buildImageNameDetails(row = {}, config = {}, fallbackTable = '', numField = '') {
  const imagenameFields = Array.isArray(config?.imagenameField)
    ? config.imagenameField
    : [];
  const imageIdField =
    typeof config?.imageIdField === 'string' ? config.imageIdField : '';
  const combinedFields = dedupeFields([
    ...imagenameFields,
    imageIdField,
  ]);
  const nameWithoutId = imagenameFields.length
    ? buildNameFromRow(row, imagenameFields)
    : '';
  const idName = imageIdField ? buildNameFromRow(row, [imageIdField]) : '';
  let primary = combinedFields.length
    ? buildNameFromRow(row, combinedFields)
    : '';
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
  let folder =
    config?.imagenameField?.length &&
    tType &&
    config.transactionTypeValue &&
    config.transactionTypeField &&
    String(getCase(row, config.transactionTypeField)) ===
      String(config.transactionTypeValue)
      ? `${slugify(String(tType))}/${slugify(String(config.transactionTypeValue))}`
      : '';
  if (!folder) {
    folder = buildFolderName(row, config?.imageFolder || fallbackTable);
  }
  if (!primary) {
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
      const baseName = sanitizeName(partsArr.join('_'));
      if (baseName) {
        if (idName && !sanitizeName(baseName).includes(sanitizeName(idName))) {
          primary = sanitizeName(`${baseName}_${idName}`);
        } else {
          primary = baseName;
        }
      }
    }
  }
  if (!primary && numField) {
    const baseName = sanitizeName(String(row[numField]));
    if (baseName) {
      if (idName && !sanitizeName(baseName).includes(sanitizeName(idName))) {
        primary = sanitizeName(`${baseName}_${idName}`);
      } else {
        primary = baseName;
      }
    }
  }
  const explicit =
    sanitizeName(
      getCase(row, '_imageName') ||
        getCase(row, 'imagename') ||
        getCase(row, 'image_name') ||
        getCase(row, 'ImageName') ||
        '',
    ) || '';
  const altNames = dedupeFields(
    [nameWithoutId, idName, explicit].filter((name) => name && name !== primary),
  );
  return {
    primary,
    nameWithoutId,
    idName,
    altNames,
    folder,
    tType,
    transTypeVal,
  };
}

function normalizeRowIdPrimaryName(primary = '', baseKey = '', idName = '') {
  if (!primary) return '';
  const safePrimary = sanitizeName(primary);
  const safeBase = sanitizeName(baseKey);
  const safeId = sanitizeName(idName);
  if (!safeId) return safePrimary;
  if (safeBase && safePrimary.includes(safeBase)) {
    return sanitizeName(safePrimary.replace(safeBase, safeId));
  }
  if (!safePrimary.includes(safeId)) {
    return sanitizeName(`${safePrimary}_${safeId}`);
  }
  return safePrimary;
}

function buildPrimaryFromConfigs(row = {}, configs = {}, fallbackTable = '', numField = '') {
  const { fields } = collectAllConfigImageFields(configs);
  let primary = fields.length ? buildNameFromRow(row, fields) : '';
  if (!primary) {
    const cfg = pickConfig(configs, row);
    primary = buildImageNameDetails(row, cfg, fallbackTable, numField).primary;
  }
  return primary;
}

async function findTxnByRowIdInTable(table, baseName, companyId = 0, configs = null) {
  if (!table || !baseName) return null;
  let cfgs = configs;
  if (!cfgs) {
    try {
      const { config } = await getConfigsByTable(table, companyId);
      cfgs = config;
    } catch {
      cfgs = {};
    }
  }
  const columns = await getTableColumns(table);
  if (!columns.length) return null;
  const idFields = dedupeFields([
    ...collectImageIdFields(cfgs),
    'id',
  ]).filter((field) => columns.includes(field));
  if (!idFields.length) return null;
  const candidates = buildIdCandidates(baseName);
  if (!candidates.length) return null;
  for (const field of idFields) {
    for (const candidate of candidates) {
      try {
        const [rows] = await pool.query(
          `SELECT * FROM \`${table}\` WHERE \`${field}\` = ? LIMIT 1`,
          [candidate],
        );
        if (rows.length) {
          const numField = await getNumFieldForTable(table);
          return { table, row: rows[0], configs: cfgs, numField, matchedByRowId: true };
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function escapeLike(value = '') {
  return String(value).replace(/[\\%_]/g, '\\$&');
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

function matchesImagePrefix(prefix, candidate) {
  const left = sanitizeName(prefix || '');
  const right = sanitizeName(candidate || '');
  if (!left || !right) return false;
  if (left === right) return true;
  if (right.startsWith(`${left}_`)) return true;
  if (left.startsWith(`${right}_`)) return true;
  return false;
}

function reduceImagePrefix(prefix = '', parts = 2) {
  const segments = sanitizeName(prefix).split('_').filter(Boolean);
  if (!segments.length) return '';
  return segments.slice(0, parts).join('_');
}

function matchesImagePrefixVariants(prefix, candidate) {
  if (matchesImagePrefix(prefix, candidate)) return true;
  const reduced = reduceImagePrefix(prefix);
  if (!reduced || reduced === sanitizeName(prefix || '')) return false;
  return matchesImagePrefix(reduced, candidate);
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

async function findPromotedTempMatch(
  imagePrefix,
  companyId = 0,
  timestamp = null,
  suffix = '',
) {
  if (!imagePrefix && !suffix) return null;
  const escapedPrefix = imagePrefix ? escapeLike(imagePrefix) : '';
  const escapedSuffix = suffix ? escapeLike(suffix) : '';
  const likeClauses = [];
  const likeParams = [];
  if (escapedPrefix) {
    const like = `%${escapedPrefix}%`;
    likeClauses.push(
      'payload_json LIKE ? ESCAPE \'\\\\\'',
      'cleaned_values_json LIKE ? ESCAPE \'\\\\\'',
      'raw_values_json LIKE ? ESCAPE \'\\\\\'',
    );
    likeParams.push(like, like, like);
  }
  if (escapedSuffix) {
    const like = `%${escapedSuffix}%`;
    likeClauses.push(
      'payload_json LIKE ? ESCAPE \'\\\\\'',
      'cleaned_values_json LIKE ? ESCAPE \'\\\\\'',
      'raw_values_json LIKE ? ESCAPE \'\\\\\'',
    );
    likeParams.push(like, like, like);
  }
  if (!likeClauses.length) return null;
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT table_name, promoted_record_id, payload_json, raw_values_json, cleaned_values_json
         FROM transaction_temporaries
        WHERE company_id = ?
          AND status = 'promoted'
          AND promoted_record_id IS NOT NULL
          AND (${likeClauses.join(' OR ')})
        ORDER BY updated_at DESC
        LIMIT 20`,
      [companyId, ...likeParams],
    );
  } catch {
    return null;
  }
  for (const row of rows || []) {
    const imageName = extractTempImageName(row);
    if (!imageName) continue;
    if (
      !matchesImagePrefixVariants(imagePrefix, imageName) &&
      !(suffix && imageName.includes(suffix))
    ) {
      continue;
    }
    const promotedRecordId = row.promoted_record_id;
    let promotedRows;
    try {
      [promotedRows] = await pool.query(
        `SELECT * FROM \`${row.table_name}\` WHERE id = ? LIMIT 1`,
        [row.promoted_record_id],
      );
    } catch {
      continue;
    }
    const promotedRow = promotedRows?.[0];
    if (!promotedRow) continue;
    let cfgs = {};
    try {
      const { config } = await getConfigsByTable(row.table_name, companyId);
      cfgs = config;
    } catch {}
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
  if (!timestamp) return null;
  let recentRows;
  try {
    [recentRows] = await pool.query(
      `SELECT table_name, promoted_record_id, payload_json, raw_values_json, cleaned_values_json
         FROM transaction_temporaries
        WHERE company_id = ?
          AND status = 'promoted'
          AND promoted_record_id IS NOT NULL
          AND ABS(TIMESTAMPDIFF(SECOND, FROM_UNIXTIME(?/1000), updated_at)) < 172800
        ORDER BY updated_at DESC
        LIMIT 50`,
      [companyId, timestamp],
    );
  } catch {
    return null;
  }
  for (const row of recentRows || []) {
    const imageName = extractTempImageName(row);
    if (
      imageName &&
      (matchesImagePrefixVariants(imagePrefix, imageName) ||
        (suffix && imageName.includes(suffix)))
    ) {
      // falls through to promoted row fetch below
    } else if (!imageName) {
      // allow prefix check against resolved image name on posted row
    } else {
      continue;
    }
    let promotedRows;
    try {
      [promotedRows] = await pool.query(
        `SELECT * FROM \`${row.table_name}\` WHERE id = ? LIMIT 1`,
        [row.promoted_record_id],
      );
    } catch {
      continue;
    }
    const promotedRow = promotedRows?.[0];
    if (!promotedRow) continue;
    let cfgs = {};
    try {
      const { config } = await getConfigsByTable(row.table_name, companyId);
      cfgs = config;
    } catch {}
    const resolved = resolveImageNamingForSearch(
      promotedRow,
      cfgs,
      row.table_name,
    );
    if (!matchesImagePrefixVariants(imagePrefix, resolved.name)) {
      const prefixOnly = resolveImagePrefixForSearch(
        promotedRow,
        cfgs,
        row.table_name,
      );
      if (!matchesImagePrefixVariants(imagePrefix, prefixOnly.name)) {
        continue;
      }
    }
    const numField = await getNumFieldForTable(row.table_name);
    return {
      table: row.table_name,
      row: promotedRow,
      configs: cfgs,
      numField,
      tempPromoted: true,
      promotedRecordId: row.promoted_record_id,
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
  const conversionIssues = [];
  const prefix = sanitizeName(name);
  const uploaderTag = uploaderId ? `__u${sanitizeName(uploaderId)}__` : '';
  let mimeLib;
  try {
    mimeLib = (await import('mime-types')).default;
  } catch {}
  for (const file of files) {
    const originalExt =
      path.extname(file.originalname) || `.${mimeLib?.extension(file.mimetype) || 'bin'}`;
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseName = `${prefix}${uploaderTag}_${unique}`;
    const isHeic = isHeicFile(file.originalname, file.mimetype);
    const originalName = `${baseName}${originalExt}`;
    const dest = path.join(dir, originalName);
    let optimized = false;
    if (isHeic) {
      try {
        await fs.rename(file.path, dest);
      } catch {
        // ignore
      }
      const converted = await ensureJpegForHeic(
        dest,
        file.originalname,
        file.mimetype,
        conversionIssues,
      );
      if (converted) {
        saved.push(`${urlBase}/${folder || table}/${path.basename(converted)}`);
      } else {
        saved.push(`${urlBase}/${folder || table}/${originalName}`);
      }
      continue;
    }
    try {
      let sharpLib;
      try {
        sharpLib = (await import('sharp')).default;
      } catch {}
      if (sharpLib) {
        let conversionBlocked = false;
        const stats = await fs.stat(file.path).catch(() => null);
        if (!stats) {
          conversionIssues.push({
            file: file.originalname,
            reason: 'file missing',
          });
          conversionBlocked = true;
        } else {
          try {
            await sharpLib(file.path).metadata();
          } catch (err) {
            conversionIssues.push({
              file: file.originalname,
              reason: 'decode error',
              detail: err?.message || String(err),
            });
            conversionBlocked = true;
          }
        }
        if (!conversionBlocked) {
          const image = sharpLib(file.path).resize({ width: 1200, height: 1200, fit: 'inside' });
          try {
            if (/\.jpe?g$/i.test(originalExt)) {
              await image.jpeg({ quality: 80 }).toFile(dest);
            } else if (/\.png$/i.test(originalExt)) {
              await image.png({ quality: 80 }).toFile(dest);
            } else if (/\.webp$/i.test(originalExt)) {
              await image.webp({ quality: 80 }).toFile(dest);
            } else {
              await image.toFile(dest);
            }
            await fs.unlink(file.path);
            optimized = true;
          } catch (err) {
            conversionIssues.push({
              file: file.originalname,
              reason: 'write error',
              detail: err?.message || String(err),
            });
          }
        }
      }
    } catch {}
    if (!optimized) {
      try {
        await fs.rename(file.path, dest);
      } catch {
        // ignore
      }
    }
    saved.push(`${urlBase}/${folder || table}/${originalName}`);
  }
  return { files: saved, conversionIssues };
}

export async function listImages(table, name, folder = null, companyId = 0) {
  const { baseDir, urlBase } = await getDirs(companyId);
  ensureDir(baseDir);
  const dir = path.join(baseDir, folder || table);
  ensureDir(dir);
  const prefix = sanitizeName(name);
  const conversionIssues = [];
  try {
    const files = await fs.readdir(dir);
    const results = [];
    const seen = new Set();
    for (const file of files) {
      if (!file.startsWith(prefix + '_')) continue;
      if (isHeicFile(file)) {
        const jpgPath = await ensureJpegForHeic(path.join(dir, file), file, '', conversionIssues);
        if (jpgPath) {
          const jpgName = path.basename(jpgPath);
          if (!seen.has(jpgName)) {
            results.push(`${urlBase}/${folder || table}/${jpgName}`);
            seen.add(jpgName);
          }
          continue;
        }
      }
      if (!seen.has(file)) {
        results.push(`${urlBase}/${folder || table}/${file}`);
        seen.add(file);
      }
    }
    return { files: results, conversionIssues };
  } catch {
    return { files: [], conversionIssues };
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
  const seen = new Set();

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
        let relName = relPath.replace(/\\\\/g, '/');
        if (isHeicFile(entry.name)) {
          const jpgPath = await ensureJpegForHeic(full, entry.name);
          if (jpgPath) {
            relName = path.join(rel, path.basename(jpgPath)).replace(/\\\\/g, '/');
          }
        }
        if (!seen.has(relName)) {
          list.push(`${urlBase}/${relName}`);
          seen.add(relName);
        }
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
  const targetDir = path.join(baseDir, 'deleted_images');
  ensureDir(targetDir);
  const prefix = sanitizeName(name);
  try {
    const files = await fs.readdir(dir);
    const deleted = [];
    for (const f of files) {
      if (f.startsWith(prefix + '_')) {
        const src = path.join(dir, f);
        const dest = path.join(targetDir, f);
        await fs.rename(src, dest).catch(async () => {
          await fs.copyFile(src, dest);
          await fs.unlink(src);
        });
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
      const { baseName, suffix: baseSuffix } = splitImageBase(base);
      const baseKey = sanitizeName(stripUploaderTag(baseName));
      const filePath = path.join(dirPath, f);
      let unique = '';
      let suffix = baseSuffix || '';
      let found;
      const save = parseSaveName(base);
      let suffixMatch = null;
      if (save) {
        ({ unique } = save);
        suffix = save.ts
          ? `_${save.ts}_${save.rand}`
          : save.rand
            ? `__${save.rand}`
            : '';
        if (!isTemporaryGeneratedName(base) && hasTxnCode(base, unique, codes)) {
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
        suffixMatch = parseSaveSuffix(base);
        if (suffixMatch) {
          suffix = suffixMatch.suffix;
        }
        const parsed = parseFileUnique(base);
        unique = parsed.unique;
        if (!suffix && parsed.suffix) {
          suffix = parsed.suffix;
        }
        if (!unique) {
          found = await findTxnByRowIdInTable(entry.name, baseKey, companyId);
          if (!found) {
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
        }
        if (!isTemporaryGeneratedName(base) && hasTxnCode(base, unique, codes)) {
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
        if (!found) {
          found = await findTxnByUniqueId(unique, companyId);
        }
      }
      if (!found) {
        const tempPrefix = extractImagePrefix(base);
        const tempMatch = await findPromotedTempMatch(
          tempPrefix,
          companyId,
          save?.ts ? Number(save.ts) : suffixMatch?.ts ? Number(suffixMatch.ts) : null,
          suffix,
        );
        if (tempMatch) {
          found = tempMatch;
        }
      }
      if (!found && baseKey) {
        found = await findTxnByRowIdInTable(entry.name, baseKey, companyId);
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
      const { row, configs, numField, tempPromoted, matchedByRowId } = found;
      const promotedRecordId = found?.promotedRecordId ?? null;

      const cfgEntry = pickConfigEntry(configs, row);
      const cfg = cfgEntry.config;
      let configNames = cfgEntry.name ? [cfgEntry.name] : [];
      let newBase = '';
      let folderRaw = '';
      if (tempPromoted) {
        const resolved = resolveImageNamingForSearch(
          row,
          configs,
          found.table || entry.name,
        );
        if (resolved.name) {
          newBase = resolved.name;
          folderRaw = resolved.folder;
          configNames = resolved.configNames.length ? resolved.configNames : configNames;
        }
      }
      if (!newBase) {
        const naming = buildImageNameDetails(
          row,
          cfg,
          found.table || entry.name,
          numField,
        );
        newBase = naming.primary;
        if (matchedByRowId) {
          const primaryFromConfigs = buildPrimaryFromConfigs(
            row,
            configs,
            found.table || entry.name,
            numField,
          );
          newBase = normalizeRowIdPrimaryName(
            primaryFromConfigs || newBase,
            baseKey,
            naming.idName,
          );
        }
        folderRaw = naming.folder;
        if (
          baseKey &&
          newBase &&
          matchesImagePrefixVariants(baseKey, newBase) &&
          !isTemporaryGeneratedName(base)
        ) {
          skipped.push({
            currentName: f,
            newName: f,
            folder: entry.name,
            folderDisplay: '/' + entry.name,
            currentPath: filePath,
            reason: 'Already primary name',
          });
          continue;
        }
        const altMatch =
          baseKey &&
          naming.altNames.some(
            (alt) =>
              matchesImagePrefixVariants(baseKey, alt) ||
              matchesImagePrefixVariants(alt, baseKey),
          );
        if ((altMatch || matchedByRowId) && newBase) {
          unique = '';
          if (matchedByRowId) {
            suffix = '';
          }
        }
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
      const recordId =
        promotedRecordId ||
        getCase(row, 'id') ||
        (numField ? getCase(row, numField) : '') ||
        '';
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
          recordId,
          configName: configNames.join(', '),
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
    const { baseName } = splitImageBase(base);
    const baseKey = sanitizeName(stripUploaderTag(baseName));
    let unique = '';
    let suffix = '';
    let found;
    let reason = '';
    const save = parseSaveName(base);
    if (save) {
      ({ unique } = save);
      suffix = save.ts
        ? `_${save.ts}_${save.rand}`
        : save.rand
          ? `__${save.rand}`
          : '';
      if (!isTemporaryGeneratedName(base) && hasTxnCode(base, unique, codes)) {
        reason = 'Already renamed';
      } else {
        found = await findTxnByParts(
          save.inv,
          save.sp,
          save.transType,
          Number(save.ts),
          companyId,
        );
        if (!found) {
          const tempPrefix = extractImagePrefix(base);
          found = await findPromotedTempMatch(
            tempPrefix,
            companyId,
            Number(save.ts),
            suffix,
          );
        }
      }
    } else {
      const suffixMatch = parseSaveSuffix(base);
      if (suffixMatch) {
        suffix = suffixMatch.suffix;
      }
      const parsed = parseFileUnique(base);
      unique = parsed.unique;
      if (!suffix && parsed.suffix) suffix = parsed.suffix;
      if (!unique) {
        reason = 'Invalid filename';
      } else if (!isTemporaryGeneratedName(base) && hasTxnCode(base, unique, codes)) {
        reason = 'Already renamed';
      } else {
        found = await findTxnByUniqueId(unique, companyId);
        if (!found && suffixMatch) {
          const tempPrefix = extractImagePrefix(base);
          found = await findPromotedTempMatch(
            tempPrefix,
            companyId,
            Number(suffixMatch.ts),
            suffix,
          );
        }
      }
    }
    if (!reason && !found) reason = 'Transaction not found';
    if (found && !reason) {
      const { row, configs, numField, matchedByRowId } = found;
      const cfg = pickConfig(configs, row);
      let newBase = '';
      let folderRaw = '';
      const naming = buildImageNameDetails(row, cfg, found.table, numField);
      newBase = naming.primary;
      if (matchedByRowId) {
        const primaryFromConfigs = buildPrimaryFromConfigs(
          row,
          configs,
          found.table,
          numField,
        );
        newBase = normalizeRowIdPrimaryName(
          primaryFromConfigs || newBase,
          baseKey,
          naming.idName,
        );
      }
      folderRaw = naming.folder;
      const altMatch =
        baseKey &&
        naming.altNames.some(
          (alt) =>
            matchesImagePrefixVariants(baseKey, alt) ||
            matchesImagePrefixVariants(alt, baseKey),
        );
      if ((altMatch || matchedByRowId) && newBase) {
        unique = '';
        if (matchedByRowId) {
          suffix = '';
        }
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
    if (!isTemporaryGeneratedName(base) && hasTxnCode(base, unique, codes)) {
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
