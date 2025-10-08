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

function collectRows(snapshotLike) {
  for (const key of ROW_ARRAY_KEYS) {
    const candidate = snapshotLike?.[key];
    if (Array.isArray(candidate) && candidate.length) {
      const filtered = candidate.filter(isPlainObject);
      if (filtered.length) {
        return filtered;
      }
    }
  }
  if (isPlainObject(snapshotLike?.row)) return [snapshotLike.row];
  if (isPlainObject(snapshotLike?.record)) return [snapshotLike.record];
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

function mapTotalRowArray(candidate, snapshotLike) {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return null;
  }

  const columnCandidates = [
    snapshotLike?.columns,
    snapshotLike?.snapshotColumns,
    snapshotLike?.snapshot_columns,
    snapshotLike?.columnNames,
    snapshotLike?.column_names,
  ];

  let columns = [];
  for (const colCandidate of columnCandidates) {
    const normalized = normalizeColumnList(colCandidate);
    if (normalized.length) {
      columns = normalized;
      break;
    }
  }

  if (!columns.length) {
    const sampleRow = Array.isArray(snapshotLike?.rows) && snapshotLike.rows.length
      ? snapshotLike.rows[0]
      : Array.isArray(snapshotLike?.data) && snapshotLike.data.length
      ? snapshotLike.data[0]
      : null;
    if (isPlainObject(sampleRow)) {
      columns = Object.keys(sampleRow);
    }
  }

  if (!columns.length) {
    columns = candidate.map((_, idx) => `column_${idx + 1}`);
  }

  const entries = columns
    .map((col, idx) => [col, candidate[idx]])
    .filter(([key]) => typeof key === 'string' && key);

  if (!entries.length) return null;

  return Object.fromEntries(entries);
}

function deriveTotalRow(snapshotLike) {
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
    const mapped = mapTotalRowArray(candidate, snapshotLike);
    if (mapped) {
      return mapped;
    }
  }
  return null;
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

function deriveColumns(snapshotLike, rows) {
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

function deriveRows(snapshotLike) {
  const collected = collectRows(snapshotLike);
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
  return [];
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

  const rows = deriveRows(snapshotLike);
  const columns = deriveColumns(snapshotLike, rows);
  const rowCount = deriveRowCount(snapshotLike, rows.length);
  const fieldTypeMap = deriveFieldTypeMap(snapshotLike);
  const artifact = deriveArtifact(snapshotLike);
  const totalRow = deriveTotalRow(snapshotLike);

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
