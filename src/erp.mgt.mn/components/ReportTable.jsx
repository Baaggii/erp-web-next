import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function ReportTable({
  procedure = '',
  params = {},
  rows = [],
  buttonPerms = {},
  fieldTypeMap = {},
  fieldLineage = {},
  showTotalRowCount = true,
  maxHeight = 'min(70vh, calc(100vh - 20rem))',
  onSnapshotReady,
}) {
  const { user, company } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState(null); // { col, dir }
  const [search, setSearch] = useState('');
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});
  const [txnInfo, setTxnInfo] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [frozenColumns, setFrozenColumns] = useState(0);

  const columns = useMemo(
    () => (rows && rows.length ? Object.keys(rows[0]) : []),
    [rows],
  );
  const lineageMap = useMemo(
    () => (fieldLineage && typeof fieldLineage === 'object' ? fieldLineage : {}),
    [fieldLineage],
  );
  const relationDisplayColumns = useMemo(() => {
    const sourceIndex = {};
    Object.entries(lineageMap).forEach(([col, info]) => {
      if (!info?.sourceTable || !info?.sourceColumn) return;
      const key = `${info.sourceTable}`.toLowerCase();
      const columnKey = `${info.sourceColumn}`.toLowerCase();
      const lookup = `${key}|${columnKey}`;
      if (!sourceIndex[lookup]) {
        sourceIndex[lookup] = col;
      }
    });
    const map = {};
    Object.entries(lineageMap).forEach(([col, info]) => {
      const rel = info?.relation;
      if (!rel?.targetTable || !rel?.displayField) return;
      const lookup = `${String(rel.targetTable).toLowerCase()}|${String(
        rel.displayField,
      ).toLowerCase()}`;
      const displayColumn = sourceIndex[lookup];
      if (displayColumn) map[col] = displayColumn;
    });
    return map;
  }, [lineageMap]);

  const resolveCell = useCallback((row, column) => {
    const displayColumn = relationDisplayColumns[column] || column;
    const displayValue = row?.[displayColumn];
    if (
      displayColumn !== column &&
      (displayValue === undefined || displayValue === null || displayValue === '')
    ) {
      return { value: row?.[column], displayColumn: column };
    }
    return { value: displayValue, displayColumn };
  }, [relationDisplayColumns]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  useEffect(() => {
    setColumnFilters((prev) => {
      const next = {};
      let changed = false;
      columns.forEach((c) => {
        if (prev[c]) next[c] = prev[c];
      });
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [columns]);

  function handleColumnFilterChange(col, value) {
    setColumnFilters((prev) => {
      const next = { ...prev, [col]: value };
      if (!value) delete next[col];
      return next;
    });
    setPage(1);
  }


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

  const columnHeaderMap = useHeaderMappings(columns);

  useEffect(() => {
    if (typeof onSnapshotReady !== 'function') return;
    const snapshotRows = Array.isArray(rows)
      ? rows.map((row) => (row && typeof row === 'object' ? { ...row } : row))
      : [];
    onSnapshotReady({
      procedure,
      params,
      columns,
      rows: snapshotRows,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      fieldTypeMap,
    });
  }, [onSnapshotReady, rows, columns, fieldTypeMap, procedure, params]);

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
  const resolvePlaceholder = useCallback(
    (column, displayColumn) => placeholders[displayColumn] || placeholders[column],
    [placeholders],
  );

  const filtered = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, val]) => val);
    const filteredRows = activeFilters.length
      ? rows.filter((r) =>
          activeFilters.every(([col, val]) =>
            String(resolveCell(r, col).value ?? '')
              .toLowerCase()
              .includes(String(val).toLowerCase()),
          ),
        )
      : rows;

    if (!search) return filteredRows;
    const s = search.toLowerCase();
    return filteredRows.filter((r) =>
      columns.some((c) =>
        String(resolveCell(r, c).value ?? '').toLowerCase().includes(s),
      ),
    );
  }, [rows, search, columns, columnFilters, resolveCell]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { col, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = resolveCell(a, col).value;
      const bv = resolveCell(b, col).value;
      if (av == null && bv == null) return 0;
      if (av == null) return dir === 'asc' ? -1 : 1;
      if (bv == null) return dir === 'asc' ? 1 : -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sort, resolveCell]);

  const columnAlign = useMemo(() => {
    const map = {};
    columns.forEach((c) => {
      const sample = sorted.find((r) => {
        const val = resolveCell(r, c).value;
        return val !== null && val !== undefined;
      });
      const sampleValue = sample ? resolveCell(sample, c).value : undefined;
      map[c] = typeof sampleValue === 'number' ? 'right' : 'left';
    });
    return map;
  }, [columns, sorted, resolveCell]);

  const columnWidths = useMemo(() => {
    const map = {};
    if (sorted.length === 0) return map;
    columns.forEach((c) => {
      const values = sorted
        .slice(0, 20)
        .map((r) => (resolveCell(r, c).value ?? '').toString());
      const avg = values.length
        ? Math.round(values.reduce((sum, val) => sum + val.length, 0) / values.length)
        : 0;
      let w;
      if (avg <= 4) w = ch(Math.max(avg + 1, 5));
      else if (resolvePlaceholder(c, relationDisplayColumns[c])?.includes('YYYY-MM-DD'))
        w = ch(12);
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [columns, sorted, resolveCell, resolvePlaceholder, relationDisplayColumns]);

  useEffect(() => {
    setFrozenColumns((prev) => {
      if (prev > columns.length) return columns.length;
      if (prev < 0) return 0;
      return prev;
    });
  }, [columns]);

  const stickyOffsets = useMemo(() => {
    const offsets = {};
    let left = 0;
    columns.forEach((col, idx) => {
      if (idx >= frozenColumns) return;
      offsets[col] = left;
      left += columnWidths[col] || ch(12);
    });
    return offsets;
  }, [columns, frozenColumns, columnWidths]);

  const numericColumns = useMemo(
    () =>
      columns.filter((c) =>
        sorted.some(
          (r) => {
            const value = resolveCell(r, c).value;
            return (
              value !== null &&
              value !== '' &&
              !isNaN(Number(String(value).replace(',', '.')))
            );
          },
        ),
      ),
    [columns, sorted, resolveCell],
  );

  const totals = useMemo(() => {
    const sums = {};
    numericColumns.forEach((c) => {
      sums[c] = sorted.reduce((sum, r) => {
        const { value } = resolveCell(r, c);
        const val = Number(String(value ?? 0).replace(',', '.'));
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    });
    return sums;
  }, [numericColumns, sorted, resolveCell]);

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

  function handleCellClick(col, value, row) {
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
      const num = Number(String(firstVal).replace(',', '.'));
      if (!Number.isNaN(num)) firstVal = num;
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
        company_id: company,
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
  }

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

  const handlePrintTable = useCallback(() => {
    if (!columns.length) return;
    const headerHtml = columns
      .map((col) => {
        const label = fieldLabels[col] || columnHeaderMap[col] || col;
        return `<th>${escapeHtml(label)}</th>`;
      })
      .join('');
    const bodyHtml = sorted
      .map((row) => {
        const cells = columns
          .map((col) => {
            const { value, displayColumn } = resolveCell(row, col);
            const cellPlaceholder = resolvePlaceholder(col, displayColumn);
            const cellValue = numericColumns.includes(col)
              ? formatNumber(value)
              : formatCellValue(value, cellPlaceholder);
            return `<td>${escapeHtml(cellValue)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const totalRowHtml =
      showTotalRowCount && numericColumns.length > 0
        ? `<tfoot><tr>${columns
            .map((col, idx) => {
              if (idx === 0) return '<td>TOTAL</td>';
              if (numericColumns.includes(col)) {
                return `<td>${escapeHtml(formatNumber(totals[col]))}</td>`;
              }
              return '<td></td>';
            })
            .join('')}</tr></tfoot>`
        : '';
    const tableHtml = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody>${totalRowHtml}</table>`;
    const printWindow = window.open('', '_blank', 'width=1024,height=768');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>${procLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; color: #111827; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 6px; font-size: 12px; }
            th { background: #e5e7eb; text-align: left; }
            tfoot td { font-weight: bold; background: #f3f4f6; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr { page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <h1>${procLabel}</h1>
          ${tableHtml}
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
    printWindow.print();
  }, [
    columns,
    columnHeaderMap,
    fieldLabels,
    numericColumns,
    procLabel,
    resolveCell,
    resolvePlaceholder,
    showTotalRowCount,
    sorted,
    totals,
  ]);

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
      <div
        style={{
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          style={{ marginRight: '0.5rem' }}
        />
        <button type="button" onClick={handlePrintTable}>
          Print
        </button>
        {columns.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span>Freeze first</span>
            <input
              type="number"
              min="0"
              max={columns.length}
              value={frozenColumns}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isNaN(val)) return;
                const clamped = Math.min(Math.max(0, val), columns.length);
                setFrozenColumns(clamped);
              }}
              style={{ width: '4rem' }}
            />
            <span>column{frozenColumns === 1 ? '' : 's'}</span>
          </label>
        )}
      </div>
      <div
        className="table-container overflow-auto"
        style={{
          position: 'relative',
          maxWidth: '100%',
          maxHeight,
          overflow: 'auto',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        }}
      >
        <table
          className="table-manager"
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            minWidth: '1200px',
            width: 'max-content',
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
                    ...(col in stickyOffsets
                      ? {
                          position: 'sticky',
                          left: stickyOffsets[col],
                          zIndex: 20,
                          background: '#e5e7eb',
                          boxShadow: '1px 0 0 #d1d5db',
                        }
                      : {}),
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
            <tr>
              {columns.map((col) => (
                <th
                  key={`${col}-filter`}
                  style={{
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    fontSize: '0.75rem',
                    textAlign: columnAlign[col],
                    width: columnWidths[col],
                    minWidth: columnWidths[col],
                    maxWidth: MAX_WIDTH,
                    resize: 'horizontal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    ...(col in stickyOffsets
                      ? {
                          position: 'sticky',
                          left: stickyOffsets[col],
                          zIndex: 15,
                          background: '#f9fafb',
                          boxShadow: '1px 0 0 #d1d5db',
                        }
                      : {}),
                  }}
                >
                  <input
                    value={columnFilters[col] || ''}
                    onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="Filter"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="table-manager">
            {pageRows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => {
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
                  if (col in stickyOffsets) {
                    style.position = 'sticky';
                    style.left = stickyOffsets[col];
                    style.background = '#fff';
                    style.zIndex = 5;
                    style.boxShadow = '1px 0 0 #d1d5db';
                  }
                  const { value, displayColumn } = resolveCell(row, col);
                  const cellPlaceholder = resolvePlaceholder(col, displayColumn);
                  return (
                    <td
                      key={col}
                      style={{ ...style, cursor: row[col] ? 'pointer' : 'default' }}
                      onClick={() => handleCellClick(col, row[col], row)}
                    >
                      {numericColumns.includes(col)
                        ? formatNumber(value)
                        : formatCellValue(value, cellPlaceholder)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {showTotalRowCount && numericColumns.length > 0 && (
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
                      ...(col in stickyOffsets
                        ? {
                            position: 'sticky',
                            left: stickyOffsets[col],
                            background: '#f3f4f6',
                            zIndex: 6,
                            boxShadow: '1px 0 0 #d1d5db',
                          }
                        : {}),
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
