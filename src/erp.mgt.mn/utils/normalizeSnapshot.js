function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeColumnList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry === null || entry === undefined ? '' : String(entry)))
    .filter(Boolean);
}

const DATASET_META_KEYS = new Set([
  'rows',
  'snapshotRows',
  'snapshot_rows',
  'data',
  'items',
  'records',
  'row',
  'record',
  'rowCount',
  'row_count',
  'rowcount',
  'totalRows',
  'total_rows',
  'columns',
  'snapshotColumns',
  'snapshot_columns',
  'columnNames',
  'column_names',
  'fieldTypeMap',
  'field_type_map',
  'snapshotFieldTypeMap',
  'snapshot_field_type_map',
  'artifact',
  'snapshotArtifact',
  'snapshot_artifact',
  'archive',
  'snapshotArchive',
  'snapshot_archive',
  'totalRow',
  'total_row',
  'totals',
  'summary',
  'summaryRow',
  'summary_row',
  'params',
  'parameters',
  'executed_at',
]);

const ROW_ARRAY_KEYS = [
  'rows',
  'snapshotRows',
  'snapshot_rows',
  'data',
  'items',
  'records',
  'values',
  'result',
];

const SNAPSHOT_SOURCE_KEYS = [
  'snapshot',
  'snapshotData',
  'snapshot_data',
  'snapshotRow',
  'snapshot_row',
  'snapshotRecord',
  'snapshot_record',
  'snapshotDetails',
  'snapshot_details',
  'row',
  'record',
  'data',
];

function parseJsonRow(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (isPlainObject(parsed) || Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return null;
}

function normalizeRowEntry(row, columnHints = []) {
  if (!row) return null;
  if (isPlainObject(row)) {
    const entries = Object.entries(row).filter(
      ([key]) => typeof key === 'string' && key.trim(),
    );
    if (entries.length) {
      return Object.fromEntries(entries);
    }
    return null;
  }
  if (Array.isArray(row)) {
    const columns = columnHints.length
      ? columnHints
      : row.map((_, idx) => `column_${idx + 1}`);
    const normalized = Object.fromEntries(
      columns
        .map((col, idx) => [col, row[idx]])
        .filter(([key]) => Boolean(key)),
    );
    return Object.keys(normalized).length ? normalized : null;
  }
  if (typeof row === 'string') {
    const parsed = parseJsonRow(row);
    if (parsed) {
      return normalizeRowEntry(parsed, columnHints);
    }
  }
  if (typeof row === 'object') {
    const entries = Object.entries(row).filter(
      ([key]) => typeof key === 'string' && key.trim(),
    );
    if (entries.length) {
      return Object.fromEntries(entries);
    }
  }
  return null;
}

function extractColumnHints(snapshotLike) {
  const candidates = [
    snapshotLike?.columns,
    snapshotLike?.snapshotColumns,
    snapshotLike?.snapshot_columns,
    snapshotLike?.columnNames,
    snapshotLike?.column_names,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeColumnList(candidate);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
}

function collectRows(snapshotLike, columnHints = []) {
  for (const key of ROW_ARRAY_KEYS) {
    const candidate = snapshotLike?.[key];
    if (Array.isArray(candidate) && candidate.length) {
      const normalized = candidate
        .map((row) => normalizeRowEntry(row, columnHints))
        .filter(Boolean);
      if (normalized.length) {
        return normalized;
      }
    }
  }
  const directRow = normalizeRowEntry(snapshotLike?.row, columnHints);
  if (directRow) return [directRow];
  const directRecord = normalizeRowEntry(snapshotLike?.record, columnHints);
  if (directRecord) return [directRecord];
  return [];
}

function deriveRowCount(snapshotLike, rowsLength) {
  const candidates = [
    snapshotLike?.rowCount,
    snapshotLike?.row_count,
    snapshotLike?.rowcount,
    snapshotLike?.totalRows,
    snapshotLike?.total_rows,
  ];
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num >= 0) {
      return num;
    }
  }
  return rowsLength;
}

function deriveFieldTypeMap(snapshotLike) {
  const candidates = [
    snapshotLike?.snapshotFieldTypeMap,
    snapshotLike?.snapshot_field_type_map,
    snapshotLike?.fieldTypeMap,
    snapshotLike?.field_type_map,
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) {
      return candidate;
    }
  }
  return {};
}

function deriveArtifact(snapshotLike) {
  const candidates = [
    snapshotLike?.artifact,
    snapshotLike?.snapshotArtifact,
    snapshotLike?.snapshot_artifact,
    snapshotLike?.archive,
    snapshotLike?.snapshotArchive,
    snapshotLike?.snapshot_archive,
  ];
  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function deriveColumns(snapshotLike, rows, columnHints = []) {
  if (columnHints.length) {
    return columnHints;
  }
  if (Array.isArray(rows) && rows.length) {
    const set = new Set();
    rows.forEach((row) => {
      if (!isPlainObject(row)) return;
      Object.keys(row).forEach((key) => {
        if (key) set.add(key);
      });
    });
    return Array.from(set);
  }
  return [];
}

function deriveRows(snapshotLike, columnHints = []) {
  const collected = collectRows(snapshotLike, columnHints);
  if (collected.length) {
    return collected;
  }
  if (!isPlainObject(snapshotLike)) {
    return [];
  }
  const entries = Object.entries(snapshotLike).filter(
    ([key]) => !DATASET_META_KEYS.has(key),
  );
  if (entries.length) {
    return [Object.fromEntries(entries)];
  }
  const parsed = normalizeRowEntry(snapshotLike, columnHints);
  if (parsed && parsed !== snapshotLike && isPlainObject(parsed)) {
    return [parsed];
  }
  return [];
}

function deriveTotalRow(snapshotLike, rows, columns = [], columnHints = []) {
  const candidates = [
    snapshotLike?.totalRow,
    snapshotLike?.total_row,
    snapshotLike?.totals,
    snapshotLike?.summary,
    snapshotLike?.summaryRow,
    snapshotLike?.summary_row,
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) {
      return candidate;
    }
    if (Array.isArray(candidate) && candidate.length) {
      const columnSource = columnHints.length
        ? columnHints
        : columns.length
        ? columns
        : Array.isArray(rows) && rows.length && isPlainObject(rows[0])
        ? Object.keys(rows[0])
        : candidate.map((_, idx) => `column_${idx + 1}`);
      const normalized = Object.fromEntries(
        columnSource
          .map((col, idx) => [col, candidate[idx]])
          .filter(([key]) => Boolean(key)),
      );
      if (Object.keys(normalized).length) {
        return normalized;
      }
    }
    if (typeof candidate === 'string') {
      const parsed = parseJsonRow(candidate);
      if (parsed) {
        const normalized = normalizeRowEntry(parsed, columnHints);
        if (normalized) {
          return normalized;
        }
      }
    }
  }
  return null;
}

export function normalizeSnapshotDataset(snapshotLike) {
  if (!isPlainObject(snapshotLike)) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      fieldTypeMap: {},
      artifact: null,
      totalRow: null,
    };
  }

  const columnHints = extractColumnHints(snapshotLike);
  const rows = deriveRows(snapshotLike, columnHints);
  const columns = deriveColumns(snapshotLike, rows, columnHints);
  const rowCount = deriveRowCount(snapshotLike, rows.length);
  const fieldTypeMap = deriveFieldTypeMap(snapshotLike);
  const artifact = deriveArtifact(snapshotLike);
  const totalRow = deriveTotalRow(snapshotLike, rows, columns, columnHints);

  return {
    rows,
    columns,
    rowCount,
    fieldTypeMap,
    artifact,
    totalRow,
  };
}

export function normalizeSnapshotRecord(snapshotLike) {
  if (!isPlainObject(snapshotLike)) {
    return { row: null, columns: [], fieldTypeMap: {} };
  }
  const dataset = normalizeSnapshotDataset(snapshotLike);
  return {
    row: dataset.rows.length ? dataset.rows[0] : null,
    columns: dataset.columns,
    fieldTypeMap: dataset.fieldTypeMap,
  };
}

export function resolveSnapshotSource(source) {
  if (!isPlainObject(source)) {
    return null;
  }
  for (const key of SNAPSHOT_SOURCE_KEYS) {
    const candidate = source[key];
    if (isPlainObject(candidate)) {
      return candidate;
    }
  }
  return null;
}

export default normalizeSnapshotDataset;
