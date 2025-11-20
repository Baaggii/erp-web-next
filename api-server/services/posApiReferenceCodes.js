import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { pool } from '../../db/index.js';
import { loadEndpoints } from './posApiRegistry.js';
import { invokePosApiEndpoint } from './posApiService.js';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsPath = path.resolve(__dirname, '../../config/posApiInfoSync.json');
const logPath = path.resolve(__dirname, '../../config/posApiInfoSyncLogs.json');

const VALID_SYNC_USAGES = new Set(['transaction', 'info', 'admin', 'all']);

const DEFAULT_SETTINGS = {
  autoSyncEnabled: false,
  intervalMinutes: 720,
  usage: 'all',
  endpointIds: [],
  tables: [],
};

const upload = multer({ storage: multer.memoryStorage() });

function normalizeHeaderName(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractCodesFromWorksheet(worksheet) {
  const rowsAsArrays = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
  if (!Array.isArray(rowsAsArrays) || rowsAsArrays.length === 0) {
    const error = new Error('Excel file is empty or unreadable');
    error.statusCode = 400;
    throw error;
  }

  const normalizedHeader = (rowsAsArrays[0] || []).map((cell) => normalizeHeaderName(cell));
  const headerIncludesCodes = normalizedHeader.includes('code_id') && normalizedHeader.includes('code_name');

  const headers = headerIncludesCodes
    ? normalizedHeader
    : ['code_id', 'code_name', 'parent_code_id', 'parent_code_name'];
  const dataRows = headerIncludesCodes ? rowsAsArrays.slice(1) : rowsAsArrays;

  let skipped = 0;
  const codes = dataRows
    .map((cells) => {
      const normalizedRow = headers.reduce((acc, header, index) => {
        if (!header) return acc;
        const value = Array.isArray(cells) ? cells[index] : undefined;
        acc[header] = value;
        return acc;
      }, {});

      const code = String(normalizedRow.code_id || '').trim();
      const name = String(normalizedRow.code_name || '').trim();
      if (!code || !name) {
        skipped += 1;
        return null;
      }
      return {
        code,
        name,
        parentCode: normalizedRow.parent_code_id
          ? String(normalizedRow.parent_code_id).trim()
          : undefined,
        parentName: normalizedRow.parent_code_name
          ? String(normalizedRow.parent_code_name).trim()
          : undefined,
      };
    })
    .filter(Boolean);

  if (!codes.length) {
    const error = new Error('Excel file must include code_id and code_name columns with values');
    error.statusCode = 400;
    throw error;
  }

  return { codes, skipped };
}

function normalizeUsage(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('lookup')) return 'info';
  if (normalized.includes('info')) return 'info';
  return normalized || 'transaction';
}

function sanitizeIdList(list) {
  return Array.isArray(list)
    ? Array.from(
        new Set(
          list
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      )
    : [];
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function loadSyncSettings() {
  const fileSettings = await readJson(settingsPath, {});
  const settings = { ...DEFAULT_SETTINGS, ...fileSettings };
  const intervalMinutes = Number(settings.intervalMinutes) || DEFAULT_SETTINGS.intervalMinutes;
  return {
    autoSyncEnabled: Boolean(settings.autoSyncEnabled),
    intervalMinutes,
    usage: VALID_SYNC_USAGES.has(settings.usage) ? settings.usage : DEFAULT_SETTINGS.usage,
    endpointIds: Array.isArray(settings.endpointIds)
      ? Array.from(
          new Set(
            settings.endpointIds
              .filter((value) => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        )
      : DEFAULT_SETTINGS.endpointIds,
    tables: Array.isArray(settings.tables)
      ? Array.from(
          new Set(
            settings.tables
              .filter((value) => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        )
      : DEFAULT_SETTINGS.tables,
  };
}

export async function saveSyncSettings(settings) {
  const sanitized = {
    autoSyncEnabled: Boolean(settings?.autoSyncEnabled),
    intervalMinutes: Math.max(5, Number(settings?.intervalMinutes) || DEFAULT_SETTINGS.intervalMinutes),
    usage: VALID_SYNC_USAGES.has(settings?.usage) ? settings.usage : DEFAULT_SETTINGS.usage,
    endpointIds: Array.isArray(settings?.endpointIds)
      ? Array.from(
          new Set(
            settings.endpointIds
              .filter((value) => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        )
      : DEFAULT_SETTINGS.endpointIds,
    tables: Array.isArray(settings?.tables)
      ? Array.from(
          new Set(
            settings.tables
              .filter((value) => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        )
      : DEFAULT_SETTINGS.tables,
  };
  await writeJson(settingsPath, sanitized);
  return sanitized;
}

export async function loadSyncLogs(limit = 50) {
  const logs = await readJson(logPath, []);
  if (!Array.isArray(logs)) return [];
  const sorted = logs
    .map((entry) => ({ ...entry }))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

async function appendSyncLog(entry) {
  const logs = await readJson(logPath, []);
  const next = Array.isArray(logs) ? logs : [];
  next.push(entry);
  const trimmed = next.slice(-200);
  await writeJson(logPath, trimmed);
}

async function upsertReferenceCodes(codeType, codes) {
  if (!codeType || !Array.isArray(codes)) return { added: 0, updated: 0, deactivated: 0 };
  const normalizedCodes = codes
    .map((entry) => ({
      code: String(entry.code || '').trim(),
      name: entry.name ? String(entry.name).trim() : null,
    }))
    .filter((entry) => entry.code);

  if (!normalizedCodes.length) return { added: 0, updated: 0, deactivated: 0 };

  const [existingRows] = await pool.query(
    'SELECT id, code, is_active FROM ebarimt_reference_code WHERE code_type = ?',
    [codeType],
  );
  const existingMap = new Map();
  existingRows.forEach((row) => existingMap.set(row.code, row));

  let added = 0;
  let updated = 0;

  for (const entry of normalizedCodes) {
    const current = existingMap.get(entry.code);
    if (!current) {
      await pool.query(
        `INSERT INTO ebarimt_reference_code (code_type, code, name, is_active)
         VALUES (?, ?, ?, 1)`,
        [codeType, entry.code, entry.name],
      );
      added += 1;
    } else {
      await pool.query(
        `UPDATE ebarimt_reference_code
         SET name = ?, is_active = 1
         WHERE id = ?`,
        [entry.name, current.id],
      );
      updated += 1;
      existingMap.delete(entry.code);
    }
  }

  const staleIds = Array.from(existingMap.values())
    .filter((row) => row.is_active)
    .map((row) => row.id);
  let deactivated = 0;
  if (staleIds.length) {
    await pool.query(
      `UPDATE ebarimt_reference_code
       SET is_active = 0
       WHERE id IN (${staleIds.map(() => '?').join(',')})`,
      staleIds,
    );
    deactivated = staleIds.length;
  }

  return { added, updated, deactivated };
}

function parseCodesFromEndpoint(endpointId, response) {
  if (!response || typeof response !== 'object') return [];
  if (endpointId === 'getDistrictCodes' && Array.isArray(response.districts)) {
    return response.districts.map((entry) => ({
      code_type: 'district',
      code: entry.code,
      name: entry.name || entry.city,
    }));
  }
  if (endpointId === 'getVatTaxTypes' && Array.isArray(response.vatTaxTypes)) {
    return response.vatTaxTypes.map((entry) => ({
      code_type: 'tax_reason',
      code: entry.code,
      name: entry.description,
    }));
  }
  return [];
}

export async function runReferenceCodeSync(trigger = 'manual', options = {}) {
  const startedAt = new Date();
  const settings = await loadSyncSettings();
  const endpoints = await loadEndpoints();
  const normalizedUsage = VALID_SYNC_USAGES.has(options.usage)
    ? options.usage
    : settings.usage || DEFAULT_SETTINGS.usage;
  const desiredUsage = normalizeUsage(normalizedUsage);
  const selectedEndpointIds = sanitizeIdList(
    Object.prototype.hasOwnProperty.call(options, 'endpointIds') ? options.endpointIds : settings.endpointIds,
  );
  const infoEndpoints = endpoints
    .filter((endpoint) => String(endpoint.method || '').toUpperCase() === 'GET')
    .filter((endpoint) => desiredUsage === 'all' || normalizeUsage(endpoint.usage) === desiredUsage)
    .filter((endpoint) => selectedEndpointIds.length === 0 || selectedEndpointIds.includes(endpoint.id));

  const summary = {
    added: 0,
    updated: 0,
    deactivated: 0,
    totalTypes: 0,
    attempted: infoEndpoints.length,
    successful: 0,
  };
  const errors = [];

  for (const endpoint of infoEndpoints) {
    try {
      const response = await invokePosApiEndpoint(endpoint.id, {}, { endpoint });
      const codes = parseCodesFromEndpoint(endpoint.id, response);
      summary.successful += 1;
      if (!codes.length) continue;
      const grouped = codes.reduce((acc, entry) => {
        if (!entry.code_type) return acc;
        acc[entry.code_type] = acc[entry.code_type] || [];
        acc[entry.code_type].push({ code: entry.code, name: entry.name });
        return acc;
      }, {});
      for (const [codeType, list] of Object.entries(grouped)) {
        summary.totalTypes += 1;
        const result = await upsertReferenceCodes(codeType, list);
        summary.added += result.added;
        summary.updated += result.updated;
        summary.deactivated += result.deactivated;
      }
    } catch (err) {
      errors.push({ endpoint: endpoint.id, message: err.message });
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  const logEntry = {
    timestamp: new Date().toISOString(),
    durationMs,
    ...summary,
    errors,
    trigger,
  };
  await appendSyncLog(logEntry);

  if (summary.successful === 0 && errors.length > 0) {
    const errorMessage = `Failed to refresh reference codes: ${errors.length} endpoint(s) unreachable`;
    const error = new Error(errorMessage);
    error.details = { ...summary, errors, durationMs, timestamp: logEntry.timestamp };
    throw error;
  }

  return { ...summary, errors, durationMs, timestamp: logEntry.timestamp };
}

let timer = null;

function scheduleNextRun(intervalMinutes) {
  if (timer) clearInterval(timer);
  if (!intervalMinutes || Number.isNaN(intervalMinutes)) return;
  timer = setInterval(() => {
    runReferenceCodeSync('auto').catch((err) =>
      console.error('POSAPI info sync failed', err.message || err),
    );
  }, intervalMinutes * 60 * 1000);
}

export async function initialiseReferenceCodeSync() {
  const settings = await loadSyncSettings();
  if (settings.autoSyncEnabled) {
    scheduleNextRun(settings.intervalMinutes);
  }
  return settings;
}

export function updateSyncSchedule(settings) {
  if (settings.autoSyncEnabled) {
    scheduleNextRun(settings.intervalMinutes);
  } else if (timer) {
    clearInterval(timer);
  }
}

export function getUploadMiddleware() {
  return upload.single('file');
}

export async function importStaticCodes(codeType, content) {
  if (!codeType) {
    throw new Error('codeType is required');
  }
  const text = content.toString('utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const codes = lines
    .map((line) => {
      const [code, name] = line.split(/[,;\t]/);
      return { code, name };
    })
    .filter((entry) => entry.code);
  return upsertReferenceCodes(codeType, codes);
}

export async function importStaticCodesFromXlsx(codeType, content) {
  if (!codeType) {
    throw new Error('codeType is required');
  }
  const workbook = XLSX.read(content, { type: 'buffer' });
  const [firstSheetName] = workbook.SheetNames;
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!worksheet) {
    const error = new Error('No worksheet found in Excel file');
    error.statusCode = 400;
    throw error;
  }
  const { codes, skipped } = extractCodesFromWorksheet(worksheet);
  const result = await upsertReferenceCodes(codeType, codes);
  return { ...result, skipped };
}

