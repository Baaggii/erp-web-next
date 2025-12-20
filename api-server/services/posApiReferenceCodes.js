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
  fieldMappings: {},
};

const upload = multer({ storage: multer.memoryStorage() });

function normalizeHeaderName(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseWorksheetHeaders(worksheet) {
  const [headerRow] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false }) || [];
  return new Set(
    (Array.isArray(headerRow) ? headerRow : [])
      .map((cell) => normalizeHeaderName(cell))
      .filter(Boolean),
  );
}

function extractCodesFromWorksheet(worksheet) {
  const headers = parseWorksheetHeaders(worksheet);
  if (!headers.has('code_id') || !headers.has('code_name')) {
    const error = new Error('Excel file must include code_id and code_name columns');
    error.statusCode = 400;
    throw error;
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  let skipped = 0;
  const codes = rows
    .map((row) => {
      const normalizedRow = Object.entries(row).reduce((acc, [key, value]) => {
        const normalizedKey = normalizeHeaderName(key);
        if (normalizedKey) acc[normalizedKey] = value;
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
        parentCode: normalizedRow.parent_code_id ? String(normalizedRow.parent_code_id).trim() : undefined,
        parentName: normalizedRow.parent_code_name ? String(normalizedRow.parent_code_name).trim() : undefined,
      };
    })
    .filter(Boolean);

  return { codes, skipped };
}

function normalizeUsage(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('lookup')) return 'info';
  if (normalized.includes('info')) return 'info';
  return normalized || 'transaction';
}

function sanitizeIdentifier(name) {
  const normalized = String(name || '').trim();
  if (!normalized) return '';
  return /^[a-zA-Z0-9_]+$/.test(normalized) ? normalized : '';
}

function sanitizeFieldMappings(raw, allowedTables = []) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  const allowedSet = new Set((allowedTables || []).map((value) => String(value || '').trim()).filter(Boolean));
  Object.entries(raw).forEach(([endpointId, mappings]) => {
    const normalizedEndpoint = String(endpointId || '').trim();
    if (!normalizedEndpoint || !mappings || typeof mappings !== 'object') return;
    const tableMap = {};
    Object.entries(mappings).forEach(([sourceField, target]) => {
      const normalizedField = String(sourceField || '').trim();
      const targetTable = sanitizeIdentifier(target?.table);
      const targetColumn = sanitizeIdentifier(target?.column);
      const rawValue = Object.prototype.hasOwnProperty.call(target || {}, 'value')
        ? target.value
        : undefined;
      const targetValue =
        typeof rawValue === 'string'
          ? rawValue.trim()
          : rawValue;
      if (!normalizedField || !targetTable || !targetColumn) return;
      if (allowedSet.size > 0 && !allowedSet.has(targetTable)) return;
      tableMap[normalizedField] = {
        table: targetTable,
        column: targetColumn,
        ...(targetValue !== undefined && targetValue !== '' ? { value: targetValue } : {}),
      };
    });
    if (Object.keys(tableMap).length > 0) {
      result[normalizedEndpoint] = tableMap;
    }
  });
  return result;
}

function normalizeSourceField(field) {
  if (typeof field !== 'string') return '';
  return field
    .replace(/^data\[\]\./, '')
    .replace(/^data\./, '')
    .trim();
}

function extractEndpointFieldMappings(endpoint, allowedTables = []) {
  const mappings = {};
  if (!endpoint || typeof endpoint !== 'object') return mappings;
  const allowedSet = new Set(
    (allowedTables || [])
      .map((value) => sanitizeIdentifier(value))
      .filter(Boolean),
  );

  const addMapping = (field, target) => {
    const normalizedField = normalizeSourceField(field);
    const table = sanitizeIdentifier(target?.table);
    const column = sanitizeIdentifier(target?.column);
    const rawValue = Object.prototype.hasOwnProperty.call(target || {}, 'value')
      ? target.value
      : undefined;
    const value =
      typeof rawValue === 'string'
        ? rawValue.trim()
        : rawValue;
    if (!normalizedField || !table || !column) return;
    if (allowedSet.size > 0 && !allowedSet.has(table)) return;
    mappings[normalizedField] = {
      table,
      column,
      ...(value !== undefined && value !== '' ? { value } : {}),
    };
  };

  const responseFields = Array.isArray(endpoint.responseFields) ? endpoint.responseFields : [];
  responseFields.forEach((entry) => {
    const field = typeof entry?.field === 'string'
      ? entry.field
      : typeof entry === 'string'
        ? entry
        : '';
    const mapping = entry?.mapTo || entry?.mapping || entry?.target;
    if (mapping) addMapping(field, mapping);
  });

  if (endpoint.responseFieldMappings && typeof endpoint.responseFieldMappings === 'object') {
    Object.entries(endpoint.responseFieldMappings).forEach(([field, target]) => addMapping(field, target));
  }

  return mappings;
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
    fieldMappings: sanitizeFieldMappings(settings.fieldMappings, settings.tables),
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
  sanitized.fieldMappings = sanitizeFieldMappings(settings?.fieldMappings, sanitized.tables);
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
  const normalizedCodes = [];
  const seenCodes = new Set();
  codes.forEach((entry) => {
    const code = String(entry?.code || '').trim();
    if (!code || seenCodes.has(code)) return;
    seenCodes.add(code);
    normalizedCodes.push({
      code,
      name: entry?.name ? String(entry.name).trim() : null,
    });
  });

  if (!normalizedCodes.length) return { added: 0, updated: 0, deactivated: 0 };

  const [existingRows] = await pool.query(
    'SELECT id, code, is_active FROM ebarimt_reference_code WHERE code_type = ?',
    [codeType],
  );
  const hadExistingRows = Array.isArray(existingRows) && existingRows.length > 0;
  if (hadExistingRows) {
    await pool.query('DELETE FROM ebarimt_reference_code WHERE code_type = ?', [codeType]);
  }

  let added = 0;

  const placeholders = normalizedCodes.map(() => '(?, ?, ?, 1)').join(',');
  const values = normalizedCodes.flatMap((entry) => [codeType, entry.code, entry.name]);
  if (placeholders) {
    const [result] = await pool.query(
      `INSERT INTO ebarimt_reference_code (code_type, code, name, is_active)
       VALUES ${placeholders}`,
      values,
    );
    added = Number(result?.affectedRows) || normalizedCodes.length;
  }

  return {
    added,
    updated: 0,
    deactivated: hadExistingRows ? existingRows.length : 0,
  };
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

function extractResponseRecords(response) {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object') {
    const arrayProps = Object.values(response).find((value) => Array.isArray(value));
    if (Array.isArray(arrayProps)) return arrayProps;
  }
  return [response];
}

function resolveValue(obj, path) {
  if (!path) return undefined;
  const segments = String(path)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current = obj;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    const isArraySegment = segment.endsWith('[]');
    const key = isArraySegment ? segment.slice(0, -2) : segment;
    const next = key ? current[key] : current;
    if (next === undefined || next === null) return undefined;
    if (isArraySegment) {
      if (Array.isArray(next)) {
        current = next[0];
      } else {
        current = next;
      }
    } else {
      current = next;
    }
  }
  return current;
}

async function applyFieldMappings({ response, mappings }) {
  if (!response || !mappings || typeof mappings !== 'object') return { rows: 0 };
  const mappedRowsByTable = {};
  const constantColumnsByTable = new Map();
  const records = extractResponseRecords(response);
  const tableRows = {};
  let resolvedCount = 0;
  Object.entries(mappings).forEach(([sourceField, target]) => {
    if (!sourceField || !target || typeof target !== 'object') return;
    const { table, column } = target;
    if (!table || !column) return;
    const hasExplicitValue = Object.prototype.hasOwnProperty.call(target, 'value');
    if (hasExplicitValue) {
      const constantsForTable = constantColumnsByTable.get(table) || new Map();
      constantsForTable.set(column, target.value);
      constantColumnsByTable.set(table, constantsForTable);
    }
    if (!mappedRowsByTable[table]) mappedRowsByTable[table] = new Map();
    const tableMap = mappedRowsByTable[table];
    records.forEach((record) => {
      if (record === undefined || record === null) return;
      const value = hasExplicitValue ? target.value : resolveValue(record, sourceField);
      if (value === undefined || value === null) return;
      resolvedCount += 1;
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      const compositeKey = JSON.stringify(record);
      const existing = tableMap.get(compositeKey) || {};
      existing[column] = serialized;
      tableMap.set(compositeKey, existing);
    });
  });

  const hasNonNullRecords = records.some((record) => record !== undefined && record !== null);
  const hasResolvedValues = resolvedCount > 0;
  if (hasNonNullRecords && !hasResolvedValues) {
    throw new Error(
      'Response records exist but no fields were resolved. Check responseFieldMappings paths.',
    );
  }

  let totalRows = 0;
  for (const [table, rowMap] of Object.entries(mappedRowsByTable)) {
    const rows = Array.from(rowMap.values());
    if (rows.length === 0) continue;
    tableRows[table] = (tableRows[table] || 0) + rows.length;

    const columns = Array.from(
      new Set(
        rows
          .map((row) => Object.keys(row))
          .flat()
          .map((name) => sanitizeIdentifier(name))
          .filter(Boolean),
      ),
    );
    if (columns.length === 0) continue;
    const constantsByColumn = constantColumnsByTable.get(table) || new Map();
    for (const [col, valuesSet] of constantsByColumn.entries()) {
      const values = Array.from(valuesSet).filter(
        (value) => value !== undefined && value !== null && typeof value !== 'object',
      );
      if (values.length > 0) {
        const placeholders = values.map(() => '?').join(',');
        await pool.query(`DELETE FROM \`${table}\` WHERE \`${col}\` IN (${placeholders})`, values);
      }
    }
    const codeColumn = columns.find((col) => col === 'code');
    if (codeColumn) {
      const codes = rows
        .map((row) => row[codeColumn])
        .filter((value) => value !== undefined && value !== null);
      if (codes.length > 0) {
        const placeholders = codes.map(() => '?').join(',');
        await pool.query(`DELETE FROM \`${table}\` WHERE \`${codeColumn}\` IN (${placeholders})`, codes);
      }
    }
    const constants = Array.from(constantColumnsByTable.get(table)?.entries() || []).filter(
      ([col, value]) => col && value !== undefined && value !== null && typeof value !== 'object',
    );
    if (constants.length > 0) {
      const [col, value] = constants[0];
      await pool.query(`DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [value]);
    }
    const escapedColumns = columns.map((col) => `\`${col}\``).join(',');
    const placeholders = `(${columns.map(() => '?').join(',')})`;
    const values = [];
    rows.forEach((row) => {
      columns.forEach((col) => {
        values.push(row[col] ?? null);
      });
    });
    const sql = `INSERT INTO \`${table}\` (${escapedColumns}) VALUES ${rows
      .map(() => placeholders)
      .join(',')} ON DUPLICATE KEY UPDATE ${columns
      .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
      .join(',')}`;
    const [result] = await pool.query(sql, values);
    totalRows += Number(result?.affectedRows) || rows.length;
  }
  return { rows: totalRows, tableRows };
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
  const targetTables = Array.from(
    new Set(
      infoEndpoints
        .flatMap((endpoint) => endpoint.responseTables || [])
        .map((table) => sanitizeIdentifier(table))
        .filter(Boolean),
    ),
  );

  if (infoEndpoints.length > 0 && targetTables.length === 0) {
    const error = new Error('No responseTables defined for the selected endpoints');
    error.details = { attempted: infoEndpoints.length, endpointIds: selectedEndpointIds };
    throw error;
  }

  const summary = {
    added: 0,
    updated: 0,
    deactivated: 0,
    totalTypes: 0,
    attempted: infoEndpoints.length,
    successful: 0,
    usage: desiredUsage,
    endpointIds: selectedEndpointIds,
    endpoints: infoEndpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      usage: endpoint.usage,
      method: endpoint.method,
    })),
    tables: targetTables,
    tableRows: {},
  };
  const errors = [];

  for (const endpoint of infoEndpoints) {
    try {
      if (!endpoint.responseTables || endpoint.responseTables.length === 0) {
        throw new Error(`Endpoint ${endpoint.id} defines no responseTables`);
      }
      const mappings = extractEndpointFieldMappings(endpoint, targetTables);
      if (!Object.keys(mappings).length) {
        throw new Error(`Endpoint ${endpoint.id} has no valid responseFieldMappings`);
      }
      const response = await invokePosApiEndpoint(endpoint.id, {}, { endpoint });
      const parsedCodes = parseCodesFromEndpoint(endpoint.id, response);
      if (parsedCodes.length > 0) {
        const codesByType = new Map();
        parsedCodes.forEach((entry) => {
          const codeType = String(entry?.code_type || '').trim();
          const codeValue = String(entry?.code || '').trim();
          if (!codeType || !codeValue) return;
          const name = entry?.name ? String(entry.name).trim() : null;
          const list = codesByType.get(codeType) || [];
          list.push({ code: codeValue, name });
          codesByType.set(codeType, list);
        });
        const summaryTotals = { added: 0, updated: 0, deactivated: 0 };
        for (const [codeType, codes] of codesByType.entries()) {
          const result = await upsertReferenceCodes(codeType, codes);
          summaryTotals.added += Number(result?.added) || 0;
          summaryTotals.updated += Number(result?.updated) || 0;
          summaryTotals.deactivated += Number(result?.deactivated) || 0;
          const affectedRows =
            (Number(result?.added) || 0)
            + (Number(result?.updated) || 0)
            + (Number(result?.deactivated) || 0);
          summary.tableRows.ebarimt_reference_code =
            (summary.tableRows.ebarimt_reference_code || 0)
            + (affectedRows || codes.length || 0);
        }
        summary.totalTypes += codesByType.size;
        summary.added += summaryTotals.added;
        summary.updated += summaryTotals.updated;
        summary.deactivated += summaryTotals.deactivated;
        summary.successful += 1;
        continue;
      }
      const result = await applyFieldMappings({ response, mappings });
      summary.updated += Number(result?.rows) || 0;
      if (result?.tableRows && typeof result.tableRows === 'object') {
        Object.entries(result.tableRows).forEach(([table, count]) => {
          const prev = summary.tableRows[table] || 0;
          summary.tableRows[table] = prev + count;
        });
      }
      summary.successful += 1;
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
