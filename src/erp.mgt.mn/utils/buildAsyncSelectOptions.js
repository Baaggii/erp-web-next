import { getTenantKeyList, isTenantTableShared } from './tenantKeys.js';

const relationMapCache = new Map();
const nestedLabelCache = new Map();
const displayConfigCache = new Map();
const tenantInfoCache = new Map();

function buildKeyMap(row) {
  const keyMap = {};
  if (!row || typeof row !== 'object') return keyMap;
  Object.keys(row).forEach((key) => {
    keyMap[key.toLowerCase()] = key;
  });
  return keyMap;
}

function buildRelationLabel({ row, keyMap, relationColumn, cfg, nestedLookups }) {
  if (!row || typeof row !== 'object') return '';
  if (!relationColumn) return '';
  const lowerColumn = relationColumn.toLowerCase();
  const valueKey = keyMap[lowerColumn] || relationColumn;
  const value = row[valueKey];

  const parts = [];
  const idFieldName =
    typeof cfg?.idField === 'string' && cfg.idField
      ? cfg.idField
      : relationColumn;
  const idKey = keyMap[idFieldName.toLowerCase()] || idFieldName;
  const identifier = row[idKey];

  if (identifier !== undefined && identifier !== null && identifier !== '') {
    parts.push(identifier);
  } else if (value !== undefined && value !== null && value !== '') {
    parts.push(value);
  }

  let displayFields = [];
  if (Array.isArray(cfg?.displayFields) && cfg.displayFields.length > 0) {
    displayFields = cfg.displayFields;
  } else {
    displayFields = Object.keys(row)
      .filter((field) => field !== relationColumn && field !== idFieldName)
      .slice(0, 1);
  }

  displayFields.forEach((field) => {
    if (typeof field !== 'string') return;
    const lookupKey = field.toLowerCase();
    const actualKey = keyMap[lookupKey] || field;
    if (!(actualKey in row)) return;
    let displayValue = row[actualKey];
    if (displayValue === undefined || displayValue === null || displayValue === '')
      return;
    const lookup = nestedLookups?.[lookupKey];
    if (lookup) {
      const mapKey =
        typeof displayValue === 'string' || typeof displayValue === 'number'
          ? String(displayValue)
          : displayValue;
      if (mapKey in lookup) {
        displayValue = lookup[mapKey];
      }
    }
    parts.push(displayValue);
  });

  const normalizedParts = parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => (typeof part === 'string' ? part : String(part)));

  if (normalizedParts.length > 0) return normalizedParts.join(' - ');

  const fallback = Object.values(row)
    .filter((v) => v !== undefined && v !== null && v !== '')
    .slice(0, 2)
    .map((v) => (typeof v === 'string' ? v : String(v)));
  return fallback.join(' - ');
}

async function fetchRelationMapForTable(table) {
  if (!table) return {};
  const cacheKey = table.toLowerCase();
  if (relationMapCache.has(cacheKey)) return relationMapCache.get(cacheKey);
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/relations`, {
      credentials: 'include',
    });
    if (!res.ok) {
      relationMapCache.set(cacheKey, {});
      return {};
    }
    const list = await res.json().catch(() => []);
    const map = {};
    if (Array.isArray(list)) {
      list.forEach((entry) => {
        const col = entry?.COLUMN_NAME;
        const refTable = entry?.REFERENCED_TABLE_NAME;
        const refColumn = entry?.REFERENCED_COLUMN_NAME;
        if (!col || !refTable || !refColumn) return;
        map[col.toLowerCase()] = {
          table: refTable,
          column: refColumn,
        };
      });
    }
    relationMapCache.set(cacheKey, map);
    return map;
  } catch {
    relationMapCache.set(cacheKey, {});
    return {};
  }
}

async function fetchDisplayConfig(table) {
  if (!table) return {};
  const cacheKey = table.toLowerCase();
  if (displayConfigCache.has(cacheKey)) return displayConfigCache.get(cacheKey);
  try {
    const res = await fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      displayConfigCache.set(cacheKey, {});
      return {};
    }
    const cfg = await res.json().catch(() => ({}));
    const normalized = {
      idField: typeof cfg?.idField === 'string' ? cfg.idField : undefined,
      displayFields: Array.isArray(cfg?.displayFields) ? cfg.displayFields : [],
    };
    displayConfigCache.set(cacheKey, normalized);
    return normalized;
  } catch {
    displayConfigCache.set(cacheKey, {});
    return {};
  }
}

async function fetchTenantInfo(table) {
  if (!table) return {};
  const cacheKey = table.toLowerCase();
  if (tenantInfoCache.has(cacheKey)) return tenantInfoCache.get(cacheKey);
  try {
    const res = await fetch(`/api/tenant_tables/${encodeURIComponent(table)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      tenantInfoCache.set(cacheKey, {});
      return {};
    }
    const info = await res.json().catch(() => ({}));
    tenantInfoCache.set(cacheKey, info || {});
    return info || {};
  } catch {
    tenantInfoCache.set(cacheKey, {});
    return {};
  }
}

async function fetchNestedLabelMap(nestedRel, { company, branch, department }) {
  if (!nestedRel?.table || !nestedRel?.column) return {};
  const cacheKey = [
    nestedRel.table.toLowerCase(),
    nestedRel.column.toLowerCase(),
    company ?? '',
    branch ?? '',
    department ?? '',
  ].join('|');
  if (nestedLabelCache.has(cacheKey)) return nestedLabelCache.get(cacheKey);

  try {
    const cfg = await fetchDisplayConfig(nestedRel.table);
    const tenantInfo = await fetchTenantInfo(nestedRel.table);
    const isShared = isTenantTableShared(tenantInfo);
    const tenantKeys = getTenantKeyList(tenantInfo);

    const perPage = 500;
    let page = 1;
    const rows = [];

    while (true) {
      const params = new URLSearchParams({ page, perPage });
      if (!isShared) {
        if (tenantKeys.includes('company_id') && company != null)
          params.set('company_id', company);
        if (tenantKeys.includes('branch_id') && branch != null)
          params.set('branch_id', branch);
        if (tenantKeys.includes('department_id') && department != null)
          params.set('department_id', department);
      }
      const res = await fetch(
        `/api/tables/${encodeURIComponent(nestedRel.table)}?${params.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) break;
      const json = await res.json().catch(() => ({}));
      const pageRows = Array.isArray(json.rows) ? json.rows : [];
      rows.push(...pageRows);
      if (pageRows.length < perPage || rows.length >= (json.count || rows.length)) {
        break;
      }
      page += 1;
    }

    const labelMap = {};
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const keyMap = buildKeyMap(row);
      const valueKey = keyMap[nestedRel.column.toLowerCase()] || nestedRel.column;
      const value = row[valueKey];
      if (value === undefined || value === null || value === '') return;
      const label = buildRelationLabel({
        row,
        keyMap,
        relationColumn: valueKey,
        cfg: {
          idField: cfg?.idField || nestedRel.column,
          displayFields: cfg?.displayFields || [],
        },
        nestedLookups: {},
      });
      const mapKey =
        typeof value === 'string' || typeof value === 'number' ? String(value) : value;
      labelMap[mapKey] = label;
    });

    nestedLabelCache.set(cacheKey, labelMap);
    return labelMap;
  } catch {
    nestedLabelCache.set(cacheKey, {});
    return {};
  }
}

async function getNestedLookups(table, fields, context) {
  if (!table || !Array.isArray(fields) || fields.length === 0) return {};
  const relationMap = await fetchRelationMapForTable(table);
  if (!relationMap || Object.keys(relationMap).length === 0) return {};
  const lookups = {};
  const seen = new Set();
  await Promise.all(
    fields.map(async (field) => {
      if (typeof field !== 'string') return;
      const lower = field.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const nestedRel = relationMap[lower];
      if (!nestedRel) return;
      const labels = await fetchNestedLabelMap(nestedRel, context);
      if (labels && Object.keys(labels).length > 0) {
        lookups[lower] = labels;
      }
    }),
  );
  return lookups;
}

export async function buildOptionsForRows({
  table,
  rows,
  idField,
  searchColumn,
  labelFields = [],
  companyId,
  branchId,
  departmentId,
}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const relationColumn = idField || searchColumn;
  const sampleRow = rows.find((row) => row && typeof row === 'object');
  const fallbackFields = [];
  if (sampleRow && relationColumn) {
    const relationLower = relationColumn.toLowerCase();
    Object.keys(sampleRow).forEach((key) => {
      if (key.toLowerCase() === relationLower) return;
      fallbackFields.push(key);
    });
  }
  const lookupFields = Array.from(
    new Set([
      ...((Array.isArray(labelFields) ? labelFields : []).filter((f) => typeof f === 'string')),
      ...fallbackFields.slice(0, 3),
    ]),
  );
  const nestedLookups = await getNestedLookups(table, lookupFields, {
    company: companyId,
    branch: branchId,
    department: departmentId,
  });
  const config = {
    idField: idField || relationColumn,
    displayFields: Array.isArray(labelFields) ? labelFields : [],
  };
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return { value: undefined, label: '' };
    }
    const keyMap = buildKeyMap(row);
    const relationKey = relationColumn
      ? keyMap[relationColumn.toLowerCase()] || relationColumn
      : relationColumn;
    const value = relationKey ? row[relationKey] : undefined;
    const label = buildRelationLabel({
      row,
      keyMap,
      relationColumn: relationKey,
      cfg: config,
      nestedLookups,
    });
    return {
      value,
      label: label || (value !== undefined && value !== null ? String(value) : ''),
    };
  });
}

export function __clearAsyncSelectOptionCaches() {
  relationMapCache.clear();
  nestedLabelCache.clear();
  displayConfigCache.clear();
  tenantInfoCache.clear();
}

