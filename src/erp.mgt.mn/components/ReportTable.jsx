import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig, { updateCache } from '../hooks/useGeneralConfig.js';

export default function ReportTable({ procedure = '', params = {}, rows = [] }) {
  const { user } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState(null); // { col, dir }
  const [search, setSearch] = useState('');
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const procLabels = generalConfig.general?.procLabels || {};
  const procFieldLabels = generalConfig.general?.procFieldLabels || {};
  const fieldLabels = procFieldLabels[procedure] || {};

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

  const procLabel = procLabels[procedure] || procedure;
  const paramText =
    generalConfig.general?.showReportParams &&
    params &&
    Object.keys(params).length > 0
      ? ` (${Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')})`
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
        <p>No data</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <h4>
        {procLabel}
        {paramText}
        {user?.role === 'admin' && generalConfig.general?.editLabelsEnabled && (
          <button onClick={handleEditProcLabel} style={{ marginLeft: '0.5rem' }}>
            Edit label
          </button>
        )}
      </h4>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          style={{ marginRight: '0.5rem' }}
        />
        <label>
          Page size:
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            style={{ marginLeft: '0.25rem' }}
          >
            {[10, 25, 50, 100, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
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
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    resize: 'horizontal',
                    overflow: 'auto',
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
                {columns.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
          Page {page} of {totalPages}
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
      </div>
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

