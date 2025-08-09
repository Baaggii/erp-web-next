import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import Modal from './Modal.jsx';

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

export default function ReportTable({ procedure = '', params = {}, rows = [] }) {
  const { user, company } = useContext(AuthContext);
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

  const columns = rows && rows.length ? Object.keys(rows[0]) : [];

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
      else if (avg <= 10) w = ch(12);
      else w = ch(20);
      map[c] = Math.min(w, MAX_WIDTH);
    });
    return map;
  }, [columns, sorted]);

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

  useEffect(() => {
    if (procedure) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `Selected procedure: ${procedure}`, type: 'info' },
        }),
      );
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
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { message: `Procedure: ${procedure}`, type: 'info' },
      }),
    );
    const firstField = columns[0];
    const payload = {
      name: procedure,
      column: col,
      params,
      groupField: firstField,
      groupValue: row[firstField],
      session: {
        empid: user?.empid,
        company_id: company?.company_id,
        branch_id: company?.branch_id,
        department_id: company?.department_id,
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
        setTxnInfo({
          loading: false,
          col,
          value,
          data: data.rows || [],
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
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `Procedure SQL saved to ${data.file || ''}: ${preview}`,
                type: 'info',
              },
            }),
          );
        } else {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: 'Procedure SQL not found', type: 'error' },
            }),
          );
        }
        if (data.sql && data.sql !== data.original) {
          const preview =
            data.sql.length > 200 ? `${data.sql.slice(0, 200)}…` : data.sql;
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `Transformed SQL saved to ${data.file || ''}: ${preview}`,
                type: 'info',
              },
            }),
          );
        } else {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: 'SQL transformation failed', type: 'error' },
            }),
          );
        }
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: `Rows fetched: ${data.rows ? data.rows.length : 0}`,
              type: data.rows && data.rows.length ? 'success' : 'error',
            },
          }),
        );
      })
      .catch((err) => {
        const sql = err && typeof err === 'object' ? err.sql || '' : '';
        const file = err && typeof err === 'object' ? err.file || '' : '';
        setTxnInfo({ loading: false, col, value, data: [], sql, displayFields: [] });
        if (sql) {
          const preview = sql.length > 200 ? `${sql.slice(0, 200)}…` : sql;
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `SQL saved to ${file}: ${preview}`,
                type: 'info',
              },
            }),
          );
        } else {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { message: 'No SQL generated', type: 'error' },
            }),
          );
        }
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: err && err.message ? err.message : 'Row fetch failed',
              type: 'error',
            },
          }),
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
          {user?.role === 'admin' && generalConfig.general?.editLabelsEnabled && (
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
        {user?.role === 'admin' && generalConfig.general?.editLabelsEnabled && (
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
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            minWidth: '1200px',
            maxWidth: '2000px',
          }}
        >
          <thead>
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
                  {fieldLabels[col] || col}
                  {sort && sort.col === col && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                  return (
                    <td
                      key={col}
                      style={{ ...style, cursor: row[col] ? 'pointer' : 'default' }}
                      onClick={() => handleCellClick(col, row[col], row)}
                    >
                      {numericColumns.includes(col) ? formatNumber(row[col]) : row[col]}
                    </td>
                  );
                })}
              </tr>
            ))}
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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {modalColumns.map((c) => (
                      <th
                        key={c}
                        style={{
                          padding: '0.25rem',
                          border: '1px solid #d1d5db',
                          textAlign: 'left',
                        }}
                      >
                        {fieldLabels[c] || c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txnInfo.data.map((r, idx) => (
                    <tr key={idx}>
                      {modalColumns.map((c) => (
                        <td
                          key={c}
                          style={{
                            padding: '0.25rem',
                            border: '1px solid #d1d5db',
                            textAlign: 'left',
                          }}
                        >
                          {typeof r[c] === 'number' ? formatNumber(r[c]) : r[c]}
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
      {user?.role === 'admin' && generalConfig.general?.editLabelsEnabled && (
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

