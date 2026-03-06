function getRowValueCaseInsensitive(row, fieldName) {
  if (!row || typeof row !== 'object' || !fieldName) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) return row[fieldName];
  const target = String(fieldName).toLowerCase();
  const actualKey = Object.keys(row).find((key) => key.toLowerCase() === target);
  return actualKey ? row[actualKey] : undefined;
}

function normalizeRelationEntry(entry = {}) {
  const sourceColumn = String(entry?.COLUMN_NAME || '').trim();
  const table = String(entry?.REFERENCED_TABLE_NAME || '').trim();
  const column = String(entry?.REFERENCED_COLUMN_NAME || '').trim();
  if (!sourceColumn || !table || !column) return null;
  return {
    sourceColumn,
    table,
    column,
    source: entry?.source || null,
    idField: typeof entry?.idField === 'string' ? entry.idField : null,
    displayFields: Array.isArray(entry?.displayFields) ? entry.displayFields : [],
    filterColumn: typeof entry?.filterColumn === 'string' ? entry.filterColumn : null,
    filterValue: entry?.filterValue,
  };
}

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

export function collectNormalizedIdsFromRows(rows = [], primaryColumn, fallbackColumns = []) {
  if (!Array.isArray(rows)) return [];
  const columns = [primaryColumn, ...(Array.isArray(fallbackColumns) ? fallbackColumns : [])]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  if (columns.length === 0) return [];
  const ids = rows
    .map((row) => {
      for (const column of columns) {
        const value = normalizeValue(getRowValueCaseInsensitive(row, column));
        if (value) return value;
      }
      return '';
    })
    .filter(Boolean);
  return Array.from(new Set(ids));
}

async function fetchAllTableRows(table, { companyId, filterColumn, filterValue } = {}) {
  const rows = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (companyId !== undefined && companyId !== null && companyId !== '') {
      params.set('company_id', String(companyId));
    }
    if (filterColumn && filterValue !== undefined && filterValue !== null && String(filterValue).trim()) {
      params.set(filterColumn, String(filterValue).trim());
    }

    const res = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const pageRows = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...pageRows);
    if (pageRows.length < perPage || rows.length >= (Number(data?.count) || rows.length)) break;
    page += 1;
  }

  return rows;
}

export async function resolveRelationRowsFromSource({
  sourceTable,
  sourceRows,
  sourceColumn,
  companyId,
}) {
  const normalizedSourceTable = String(sourceTable || '').trim();
  const normalizedSourceColumn = String(sourceColumn || '').trim();
  if (!normalizedSourceTable || !normalizedSourceColumn || !Array.isArray(sourceRows)) {
    return null;
  }

  const relationRes = await fetch(`/api/tables/${encodeURIComponent(normalizedSourceTable)}/relations`, {
    credentials: 'include',
    skipErrorToast: true,
    skipLoader: true,
  });
  if (!relationRes.ok) return null;
  const relationList = await relationRes.json().catch(() => []);
  const relation = (Array.isArray(relationList) ? relationList : [])
    .map((entry) => normalizeRelationEntry(entry))
    .filter(Boolean)
    .find((entry) => entry.sourceColumn.toLowerCase() === normalizedSourceColumn.toLowerCase());
  if (!relation) return null;

  const sourceIds = Array.from(new Set(sourceRows
    .map((row) => normalizeValue(getRowValueCaseInsensitive(row, normalizedSourceColumn)))
    .filter(Boolean)));
  if (sourceIds.length === 0) {
    return {
      relation,
      displayConfig: { idField: relation.idField || relation.column, displayFields: relation.displayFields || [] },
      rows: [],
      rowById: new Map(),
      sourceIds,
    };
  }

  const displayParams = new URLSearchParams({
    table: relation.table,
    targetColumn: relation.column,
  });
  if (relation.filterColumn) displayParams.set('filterColumn', relation.filterColumn);
  if (relation.filterColumn && relation.filterValue !== undefined && relation.filterValue !== null) {
    displayParams.set('filterValue', String(relation.filterValue));
  }
  const displayRes = await fetch(`/api/display_fields?${displayParams.toString()}`, { credentials: 'include' });
  const displayCfg = displayRes.ok ? await displayRes.json().catch(() => ({})) : {};

  const rows = await fetchAllTableRows(relation.table, {
    companyId,
    filterColumn: relation.filterColumn,
    filterValue: relation.filterValue,
  });

  const rowById = new Map();
  rows.forEach((row) => {
    const idValue = normalizeValue(getRowValueCaseInsensitive(row, relation.column));
    if (!idValue) return;
    if (!sourceIds.includes(idValue)) return;
    rowById.set(idValue, row);
  });

  return {
    relation,
    displayConfig: {
      idField: (typeof displayCfg?.idField === 'string' && displayCfg.idField) || relation.idField || relation.column,
      displayFields: Array.isArray(displayCfg?.displayFields)
        ? displayCfg.displayFields
        : Array.isArray(relation.displayFields)
          ? relation.displayFields
          : [],
    },
    rows,
    rowById,
    sourceIds,
  };
}

export { getRowValueCaseInsensitive };
