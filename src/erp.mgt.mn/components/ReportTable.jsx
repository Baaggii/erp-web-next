import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import Modal from './Modal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';

function ch(n) {
  return Math.round(n * 8);
}

function getAverageLength(columnKey, data) {
  const values = data
    .slice(0, 20)
    .map((r) => (r[columnKey] ?? '').toString());
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((sum, val) => sum + val.length, 0) / values.length,
  );
}

const MAX_WIDTH = ch(40);

const numberFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = Number(String(val).replace(',', '.'));
  return Number.isNaN(num) ? '' : numberFmt.format(num);
}

function formatCellValue(val, placeholder) {
  if (val === null || val === undefined) return '';
  let str;
  if (val instanceof Date) {
    str = formatTimestamp(val);
  } else {
    str = String(val);
  }
  if (placeholder) {
    return normalizeDateInput(str, placeholder);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return normalizeDateInput(str, 'YYYY-MM-DD');
  }
  return str;
}

function isCountColumn(name) {
  const f = String(name).toLowerCase();
  return f === 'count' || f === 'count()' || f.startsWith('count(');
}

function normalizeTransactionKey(item, defaultTable) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return null;
  const tableValue =
    item.table ?? item.tableName ?? item.sourceTable ?? defaultTable ?? '';
  const recordValue =
    item.recordId ?? item.record_id ?? item.id ?? item.transactionId;
  if (recordValue === null || recordValue === undefined || recordValue === '') {
    return null;
  }
  const recordId = String(recordValue);
  if (tableValue) return `${String(tableValue)}::${recordId}`;
  return recordId;
}

function deriveRowTransaction(row, { idField, tableField, tableName }) {
  if (!row || !idField) return null;
  const rawId = row[idField];
  if (rawId === null || rawId === undefined || rawId === '') return null;
  const recordId = String(rawId);
  let table = tableName || null;
  if (tableField && row[tableField] !== undefined && row[tableField] !== null) {
    table = String(row[tableField]);
  }
  const key = table ? `${table}::${recordId}` : recordId;
  return { key, table, recordId };
}

export default function ReportTable({
  procedure = '',
  params = {},
  rows = [],
  buttonPerms = {},
  fieldTypeMap = {},
  lockInfo = null,
  onTransactionsChange,
  onTransactionMetadata,
}) {
  const { user, branch, department } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState(null); // { col, dir }
  const [search, setSearch] = useState('');
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});
  const [txnInfo, setTxnInfo] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [rows]);


  const procLabels = generalConfig.general?.procLabels || {};
  const procFieldLabels = generalConfig.general?.procFieldLabels || {};
  const fieldLabels = procFieldLabels[procedure] || {};
  const headerMap = useHeaderMappings([procedure]);
  const general = generalConfig.general || {};

  function rowToast(message, type = 'info') {
    if (general.reportRowToastEnabled) {
      window.dispatchEvent(
        new CustomEvent('toast', { detail: { message, type } }),
      );
    }
  }

  const columns = rows && rows.length ? Object.keys(rows[0]) : [];
  const columnHeaderMap = useHeaderMappings(columns);

  const derivedIdField = useMemo(() => {
    if (lockInfo?.idField) return lockInfo.idField;
    return (
      columns.find((c) => {
        const lower = String(c).toLowerCase();
        return (
          lower === 'id' ||
          lower.endsWith('_id') ||
          lower.endsWith('id') ||
          lower.includes('transaction')
        );
      }) || null
    );
  }, [lockInfo?.idField, columns]);

  const derivedTableField = useMemo(() => {
    if (lockInfo?.tableField) return lockInfo.tableField;
    return (
      columns.find((c) => {
        const lower = String(c).toLowerCase();
        return lower === 'table' || lower === 'table_name' || lower.endsWith('table');
      }) || null
    );
  }, [lockInfo?.tableField, columns]);

  const transactionMeta = useMemo(
    () => ({
      idField: derivedIdField,
      tableField: derivedTableField,
      tableName: lockInfo?.tableName ?? null,
    }),
    [derivedIdField, derivedTableField, lockInfo?.tableName],
  );

  const pendingSet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(lockInfo?.pending)) {
      lockInfo.pending.forEach((item) => {
        const key = normalizeTransactionKey(item, transactionMeta.tableName);
        if (key) set.add(key);
      });
    }
    return set;
  }, [lockInfo?.pending, transactionMeta.tableName]);

  const lockedSet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(lockInfo?.locked)) {
      lockInfo.locked.forEach((item) => {
        const key = normalizeTransactionKey(item, transactionMeta.tableName);
        if (key) set.add(key);
      });
    }
    return set;
  }, [lockInfo?.locked, transactionMeta.tableName]);

  useEffect(() => {
    if (typeof onTransactionMetadata === 'function') {
      onTransactionMetadata(transactionMeta);
    }
  }, [transactionMeta, onTransactionMetadata]);

  useEffect(() => {
    if (typeof onTransactionsChange !== 'function') return;
    if (!transactionMeta.idField) {
      onTransactionsChange([]);
      return;
    }
    const unique = new Map();
    rows.forEach((row) => {
      const tx = deriveRowTransaction(row, transactionMeta);
      if (!tx) return;
      unique.set(tx.key, { table: tx.table, recordId: tx.recordId });
    });
    onTransactionsChange(Array.from(unique.values()));
  }, [rows, transactionMeta, onTransactionsChange]);

  const placeholders = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const typ = fieldTypeMap[c];
      if (typ === 'time') {
        map[c] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [columns, fieldTypeMap]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => String(r[c] ?? '').toLowerCase().includes(s)),
    );
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { col, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return dir === 'asc' ? -1 : 1;
      if (bv == null) return dir === 'asc' ? 1 : -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sort]);

  const columnAlign = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const sample = sorted.find((r) => r[c] !== null && r[c] !== undefined);
      map[c] = typeof sample?.[c] === 'number' ? 'right' : 'left';
    });
    return map;
  }, [columns, sorted]);

  const columnWidths = useMemo(() => {
    const map = {};
    if (sorted.length === 0) return map;
    columns.forEach((c) => {
      const avg = getAverageLength(c, sorted);
      let w;
      if (avg <= 4) w = ch(Math.max(avg + 1, 5));
      else if (placeholders[c] && placeholders[c].includes('YYYY-MM-DD'))
        w = ch(12);
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [columns, sorted, placeholders]);

  const numericColumns = useMemo(
    () =>
      columns.filter((c) =>
        sorted.some(
          (r) => r[c] !== null && r[c] !== '' && !isNaN(Number(String(r[c]).replace(',', '.'))),
        ),
      ),
    [columns, sorted],
  );

  const totals = useMemo(() => {
    const sums = {};
    numericColumns.forEach((c) => {
      sums[c] = sorted.reduce((sum, r) => {
        const val = Number(String(r[c] ?? 0).replace(',', '.'));
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    });
    return sums;
  }, [numericColumns, sorted]);

  const modalColumns = useMemo(() => {
    if (!txnInfo || !txnInfo.data || txnInfo.data.length === 0) return [];
    const all = Object.keys(txnInfo.data[0]);
    if (Array.isArray(txnInfo.displayFields) && txnInfo.displayFields.length > 0) {
      const ordered = txnInfo.displayFields.filter((f) => all.includes(f));
      const rest = all.filter((f) => !ordered.includes(f));
      return [...ordered, ...rest];
    }
    return all;
  }, [txnInfo]);

  const modalHeaderMap = useHeaderMappings(modalColumns);

  const modalPlaceholders = useMemo(() => {
    const map = {};
    modalColumns.forEach((c) => {
      const typ = fieldTypeMap[c];
      if (typ === 'time') {
        map[c] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [modalColumns, fieldTypeMap]);

  const modalAlign = useMemo(() => {
    const map = {};
    if (!txnInfo || !txnInfo.data) return map;
    modalColumns.forEach((c) => {
      const sample = txnInfo.data.find((r) => r[c] !== null && r[c] !== undefined);
      map[c] = typeof sample?.[c] === 'number' ? 'right' : 'left';
    });
    return map;
  }, [modalColumns, txnInfo]);

  const modalWidths = useMemo(() => {
    const map = {};
    if (!txnInfo || !txnInfo.data) return map;
    modalColumns.forEach((c) => {
      const avg = getAverageLength(c, txnInfo.data);
      let w;
      if (avg <= 4) w = ch(Math.max(avg + 1, 5));
      else if (modalPlaceholders[c] && modalPlaceholders[c].includes('YYYY-MM-DD'))
        w = ch(12);
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [modalColumns, txnInfo, modalPlaceholders]);

  useEffect(() => {
    if (procedure) {
      rowToast(`Selected procedure: ${procedure}`, 'info');
    }
  }, [procedure]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * perPage, page * perPage),
    [sorted, page, perPage],
  );

  function toggleSort(col) {
    setSort((prev) =>
      prev && prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' },
    );
  }

  const handleCellClick = useCallback(
    (col, value, row) => {
      const tx = deriveRowTransaction(row, transactionMeta);
      const key = tx?.key;
      if (key && (lockedSet.has(key) || pendingSet.has(key))) {
        return;
      }
      const num = Number(String(value).replace(',', '.'));
      if (!procedure || Number.isNaN(num) || num <= 0) return;
      rowToast(`Procedure: ${procedure}`, 'info');
      let displayValue = value;
      if (placeholders[col]) {
        displayValue = formatCellValue(value, placeholders[col]);
      } else if (numericColumns.includes(col)) {
        const parsed = Number(String(value).replace(',', '.'));
        if (!Number.isNaN(parsed)) displayValue = parsed;
      }
      const firstField = columns[0];

      let idx = 0;
      let groupField = columns[idx];
      let groupValue = row[groupField];

      while (
        idx < columns.length - 1 &&
        (groupField.toLowerCase() === 'modal' ||
          String(groupValue).toLowerCase() === 'modal' ||
          isCountColumn(groupField))
      ) {
        idx += 1;
        groupField = columns[idx];
        groupValue = row[groupField];
      }

      if (placeholders[groupField]) {
        groupValue = formatCellValue(groupValue, placeholders[groupField]);
      } else if (numericColumns.includes(groupField)) {
        const parsed = Number(String(groupValue).replace(',', '.'));
        if (!Number.isNaN(parsed)) groupValue = parsed;
      }

      const allConditions = [];
      for (let i = 0; i < columns.length; i++) {
        const field = columns[i];
        const val = row[field];
        if (
          !field ||
          val === undefined ||
          val === null ||
          val === '' ||
          isCountColumn(field) ||
          (i !== 0 &&
            (field.toLowerCase() === 'modal' ||
              String(val).toLowerCase() === 'modal'))
        ) {
          continue;
        }
        let outVal = val;
        if (placeholders[field]) {
          outVal = formatCellValue(val, placeholders[field]);
        } else if (numericColumns.includes(field)) {
          const numVal = Number(String(val).replace(',', '.'));
          if (!Number.isNaN(numVal)) outVal = numVal;
        }
        allConditions.push({ field, value: outVal });
      }
      const extraConditions = allConditions.filter(
        (c) => c.field !== groupField && c.field !== col && c.field !== firstField,
      );
      let firstVal = row[firstField];
      if (placeholders[firstField]) {
        firstVal = formatCellValue(firstVal, placeholders[firstField]);
      } else if (numericColumns.includes(firstField)) {
        const parsedFirst = Number(String(firstVal).replace(',', '.'));
        if (!Number.isNaN(parsedFirst)) firstVal = parsedFirst;
      }
      if (
        firstField &&
        firstVal !== undefined &&
        firstVal !== null &&
        firstVal !== '' &&
        !extraConditions.some((c) => c.field === firstField)
      ) {
        extraConditions.unshift({ field: firstField, value: firstVal });
      }
      const payload = {
        name: procedure,
        column: col,
        params,
        groupField,
        groupValue,
        extraConditions,
        session: {
          empid: user?.empid,
          branch_id: branch,
          department_id: department,
        },
      };
      setTxnInfo({ loading: true, col, value, data: [], sql: '', displayFields: [] });
      fetch('/api/procedures/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw data;
          return data;
        })
        .then((data) => {
          let outRows = (data.rows || []).map((r) => {
            const entries = Object.entries(r).filter(([k]) => !isCountColumn(k));
            return Object.fromEntries(entries);
          });
          if (idx > 0 && firstField && !isCountColumn(firstField)) {
            const replaceVal =
              firstField.toLowerCase() === 'modal' ? groupValue : displayValue;
            outRows = outRows.map((r) => ({ ...r, [firstField]: replaceVal }));
          }
          setTxnInfo({
            loading: false,
            col,
            value,
            data: outRows,
            sql: data.sql || '',
            displayFields: Array.isArray(data.displayFields)
              ? data.displayFields
              : [],
          });
          if (data.original) {
            const preview =
              data.original.length > 200
                ? `${data.original.slice(0, 200)}…`
                : data.original;
            rowToast(
              `Procedure SQL saved to ${data.file || ''}: ${preview}`,
              'info',
            );
          } else {
            rowToast('Procedure SQL not found', 'error');
          }
          if (data.sql && data.sql !== data.original) {
            const preview =
              data.sql.length > 200 ? `${data.sql.slice(0, 200)}…` : data.sql;
            rowToast(
              `Transformed SQL saved to ${data.file || ''}: ${preview}`,
              'info',
            );
          } else {
            rowToast('SQL transformation failed', 'error');
          }
          rowToast(
            `Rows fetched: ${data.rows ? data.rows.length : 0}`,
            data.rows && data.rows.length ? 'success' : 'error',
          );
        })
        .catch((err) => {
          const sql = err && typeof err === 'object' ? err.sql || '' : '';
          const file = err && typeof err === 'object' ? err.file || '' : '';
          setTxnInfo({ loading: false, col, value, data: [], sql, displayFields: [] });
          if (sql) {
            const preview = sql.length > 200 ? `${sql.slice(0, 200)}…` : sql;
            rowToast(`SQL saved to ${file}: ${preview}`, 'info');
          } else {
            rowToast('No SQL generated', 'error');
          }
          rowToast(
            err && err.message ? err.message : 'Row fetch failed',
            'error',
          );
        });
    },
    [
      branch,
      columns,
      department,
      numericColumns,
      params,
      placeholders,
      procedure,
      transactionMeta,
      lockedSet,
      pendingSet,
      user?.empid,
    ],
  );

  function handleSaveFieldLabels() {
    const existing = generalConfig.general?.procFieldLabels || {};
    const updated = { ...existing[procedure], ...labelEdits };
    const payload = {
      general: {
        procFieldLabels: { ...existing, [procedure]: updated },
      },
    };
    fetch('/api/general_config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) updateCache(data);
        setEditLabels(false);
      })
      .catch(() => setEditLabels(false));
  }

  function handleEditProcLabel() {
    const current = procLabels[procedure] || '';
    const next = window.prompt('Enter label', current);
    if (next === null) return;
    const existing = generalConfig.general?.procLabels || {};
    const payload = { general: { procLabels: { ...existing, [procedure]: next } } };
    fetch('/api/general_config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && updateCache(data));
  }

  const procLabel = procLabels[procedure] || headerMap[procedure] || procedure;
  const paramText =
    generalConfig.general?.showReportParams &&
    params &&
    Object.keys(params).length > 0
      ? Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : '';

  if (!rows || rows.length === 0) {
    return (
      <div>
        <h4>
          {procLabel}
          {buttonPerms['Edit label'] && generalConfig.general?.editLabelsEnabled && (
            <button
              onClick={handleEditProcLabel}
              style={{ marginLeft: '0.5rem' }}
            >
              Edit label
            </button>
          )}
        </h4>
        {paramText && <div style={{ marginTop: '0.25rem' }}>{paramText}</div>}
        <p>No data</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <h4>
        {procLabel}
        {buttonPerms['Edit label'] && generalConfig.general?.editLabelsEnabled && (
          <button onClick={handleEditProcLabel} style={{ marginLeft: '0.5rem' }}>
            Edit label
          </button>
        )}
      </h4>
      {paramText && <div style={{ marginTop: '0.25rem' }}>{paramText}</div>}
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          style={{ marginRight: '0.5rem' }}
        />
      </div>
      <div className="table-container overflow-x-auto">
        <table
          className="table-manager"
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            minWidth: '1200px',
            maxWidth: '2000px',
          }}
        >
          <thead className="table-manager sticky-header">
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: 1.2,
                    fontSize: '0.75rem',
                    textAlign: columnAlign[col],
                    width: columnWidths[col],
                    minWidth: columnWidths[col],
                    maxWidth: MAX_WIDTH,
                    resize: 'horizontal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
                    ...(columnWidths[col] <= ch(8)
                      ? {
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          overflowWrap: 'break-word',
                          maxHeight: '15ch',
                        }
                      : {}),
                  }}
                >
                  {fieldLabels[col] || columnHeaderMap[col] || col}
                  {sort && sort.col === col && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="table-manager">
            {pageRows.map((row, idx) => {
              const tx = deriveRowTransaction(row, transactionMeta);
              const key = tx?.key;
              const isLockedRow = key ? lockedSet.has(key) : false;
              const isPendingRow = key ? pendingSet.has(key) : false;
              const rowStatus = isLockedRow ? 'locked' : isPendingRow ? 'pending' : null;
              const rowTitle =
                rowStatus === 'locked'
                  ? 'This transaction has been locked by an approved report.'
                  : rowStatus === 'pending'
                  ? 'This transaction will be locked once the report is approved.'
                  : undefined;
              const rowStyle = rowStatus
                ? {
                    backgroundColor:
                      rowStatus === 'locked' ? '#fee2e2' : '#fef3c7',
                  }
                : undefined;
              return (
                <tr key={idx} style={rowStyle} title={rowTitle}>
                  {columns.map((col, colIdx) => {
                    const w = columnWidths[col];
                    const style = {
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      textAlign: columnAlign[col],
                    };
                    if (w) {
                      style.width = w;
                      style.minWidth = w;
                      style.maxWidth = MAX_WIDTH;
                      style.whiteSpace = 'nowrap';
                      style.overflow = 'hidden';
                      style.textOverflow = 'ellipsis';
                    }
                    const baseValue = numericColumns.includes(col)
                      ? formatNumber(row[col])
                      : formatCellValue(row[col], placeholders[col]);
                    const badge = rowStatus
                      ? (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '9999px',
                              backgroundColor:
                                rowStatus === 'locked' ? '#b91c1c' : '#d97706',
                              color: '#fff',
                              fontSize: '0.65rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {rowStatus === 'locked' ? 'Locked' : 'Pending'}
                          </span>
                        )
                      : null;
                    const showBadge = badge && colIdx === 0;
                    const content = showBadge ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          maxWidth: '100%',
                          overflow: 'hidden',
                        }}
                      >
                        {badge}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {baseValue}
                        </span>
                      </span>
                    ) : (
                      baseValue
                    );
                    const disableClick = Boolean(rowStatus);
                    return (
                      <td
                        key={col}
                        style={{
                          ...style,
                          cursor:
                            disableClick || row[col] === undefined || row[col] === null
                              ? 'default'
                              : 'pointer',
                        }}
                        onClick={() => {
                          if (disableClick) return;
                          handleCellClick(col, row[col], row);
                        }}
                        title={rowTitle}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {numericColumns.length > 0 && (
            <tfoot>
              <tr>
                {columns.map((col, idx) => (
                  <td
                    key={col}
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      textAlign: columnAlign[col],
                      fontWeight: 'bold',
                    }}
                  >
                    {idx === 0
                      ? 'TOTAL'
                      : numericColumns.includes(col)
                      ? formatNumber(totals[col])
                      : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center' }}>
        <button onClick={() => setPage(1)} disabled={page === 1}>
          {'<<'}
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={{ marginLeft: '0.25rem' }}
        >
          {'<'}
        </button>
        <span style={{ margin: '0 0.5rem' }}>
          Page
          <input
            type="number"
            value={page}
            onChange={(e) => {
              let val = Number(e.target.value) || 1;
              if (val < 1) val = 1;
              if (val > totalPages) val = totalPages;
              setPage(val);
            }}
            style={{ width: '3rem', margin: '0 0.25rem', textAlign: 'center' }}
            min="1"
            max={totalPages}
          />
          of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          style={{ marginRight: '0.25rem' }}
        >
          {'>'}
        </button>
        <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>
          {'>>'}
        </button>
        <label style={{ marginLeft: '1rem' }}>
          Page size:
          <input
            type="number"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value) || 1);
              setPage(1);
            }}
            min="1"
            style={{ marginLeft: '0.25rem', width: '4rem' }}
          />
        </label>
      </div>
      {txnInfo && (
        <Modal
          visible
          title={`Transactions for ${txnInfo.col} = ${txnInfo.value}`}
          onClose={() => setTxnInfo(null)}
          width="80%"
        >
          {txnInfo.loading ? (
            <div>Loading...</div>
          ) : txnInfo.data.length > 0 ? (
            <div className="table-container overflow-x-auto">
              <table
                className="table-manager"
                style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}
              >
                <thead className="table-manager sticky-header">
                  <tr>
                    {modalColumns.map((c) => (
                      <th
                        key={c}
                        style={{
                          padding: '0.25rem',
                          border: '1px solid #d1d5db',
                          textAlign: modalAlign[c],
                          width: modalWidths[c],
                          minWidth: modalWidths[c],
                          maxWidth: MAX_WIDTH,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fieldLabels[c] || modalHeaderMap[c] || c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="table-manager">
                  {txnInfo.data.map((r, idx) => (
                    <tr key={idx}>
                      {modalColumns.map((c) => (
                        <td
                          key={c}
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            textAlign: modalAlign[c],
                            width: modalWidths[c],
                            minWidth: modalWidths[c],
                            maxWidth: MAX_WIDTH,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {typeof r[c] === 'number'
                            ? formatNumber(r[c])
                            : formatCellValue(r[c], modalPlaceholders[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              No transactions
              {txnInfo.sql ? (
                <pre
                  style={{
                    marginTop: '0.5rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                    overflow: 'auto',
                    background: '#f9fafb',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                  }}
                >
                  {txnInfo.sql}
                </pre>
              ) : (
                <div style={{ marginTop: '0.5rem' }}>SQL not generated</div>
              )}
            </div>
          )}
        </Modal>
      )}
      {buttonPerms['Edit Field Labels'] && generalConfig.general?.editLabelsEnabled && (
        <button
          onClick={() => {
            const map = {};
            columns.forEach((c) => {
              map[c] = fieldLabels[c] || '';
            });
            setLabelEdits(map);
            setEditLabels(true);
          }}
          style={{ marginTop: '0.5rem' }}
        >
          Edit Field Labels
        </button>
      )}
      {editLabels && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }}>
            {columns.map((c) => (
              <div key={c} style={{ marginBottom: '0.5rem' }}>
                <label>
                  {c}{' '}
                  <input
                    value={labelEdits[c] || ''}
                    onChange={(e) =>
                      setLabelEdits({ ...labelEdits, [c]: e.target.value })
                    }
                  />
                </label>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
              <button onClick={() => setEditLabels(false)}>Cancel</button>
              <button onClick={handleSaveFieldLabels} style={{ marginLeft: '0.5rem' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

