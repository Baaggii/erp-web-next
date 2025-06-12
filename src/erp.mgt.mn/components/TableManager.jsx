import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function TableManager({ table }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ column: '', dir: 'asc' });
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const [columnMeta, setColumnMeta] = useState([]);
  const [autoInc, setAutoInc] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const { user } = useContext(AuthContext);

  function computeAutoInc(meta) {
    const auto = new Set(
      meta
        .filter(
          (c) => c.extra && c.extra.toLowerCase().includes('auto_increment'),
        )
        .map((c) => c.name),
    );
    if (auto.size === 0) {
      const pri = meta.filter((c) => c.key === 'PRI');
      if (pri.length === 1) auto.add(pri[0].name);
    }
    return auto;
  }

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    setRows([]);
    setCount(0);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    setRelations({});
    setRefData({});
    setColumnMeta([]);
    fetch(`/api/tables/${table}/relations`, { credentials: 'include' })
      .then((res) => res.json())
      .then((rels) => {
        if (canceled) return;
        setRelations(
          rels.reduce((acc, r) => {
            acc[r.COLUMN_NAME] = r;
            return acc;
          }, {})
        );
      });
    fetch(`/api/tables/${table}/columns`, { credentials: 'include' })
      .then((res) => res.json())
      .then((cols) => {
        if (canceled) return;
        setColumnMeta(cols);
        setAutoInc(computeAutoInc(cols));
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    setAutoInc(computeAutoInc(columnMeta));
  }, [columnMeta]);

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    const params = new URLSearchParams({ page, perPage });
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    fetch(`/api/tables/${table}?${params.toString()}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (canceled) return;
        setRows(data.rows || []);
        setCount(data.count || 0);
      });
    return () => {
      canceled = true;
    };
  }, [table, page, perPage, filters, sort]);

  useEffect(() => {
    let canceled = false;
    Object.values(relations).forEach((rel) => {
      const col = rel.COLUMN_NAME;
      if (refData[col]) return;
      fetch(`/api/tables/${rel.REFERENCED_TABLE_NAME}?perPage=100`, {
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (canceled) return;
          setRefData((d) => ({
            ...d,
            [col]: data.rows.map((r) => ({
              value: r[rel.REFERENCED_COLUMN_NAME],
              label:
                r.name || r.label || r[rel.REFERENCED_COLUMN_NAME] || 'value',
            })),
          }));
        });
    });
    return () => {
      canceled = true;
    };
  }, [relations]);

  function getRowId(row) {
    const keys = getKeyFields();
    if (keys.length === 0) return undefined;
    if (keys.length === 1) return row[keys[0]];
    return keys.map((k) => row[k]).join('-');
  }

  function getKeyFields() {
    const keys = columnMeta
      .filter((c) => c.key === 'PRI')
      .map((c) => c.name);
    if (keys.length > 0) return keys;
    return ['id'];
  }

  async function ensureColumnMeta() {
    if (columnMeta.length > 0 || !table) return;
    try {
      const res = await fetch(`/api/tables/${table}/columns`, {
        credentials: 'include',
      });
      if (res.ok) {
        const cols = await res.json();
        if (Array.isArray(cols)) {
          setColumnMeta(cols);
          setAutoInc(computeAutoInc(cols));
        }
      }
    } catch (err) {
      console.error('Failed to fetch column metadata', err);
    }
  }

  async function openAdd() {
    await ensureColumnMeta();
    setEditing(null);
    setShowForm(true);
  }

  async function openEdit(row) {
    await ensureColumnMeta();
    setEditing(row);
    setShowForm(true);
  }

  function toggleRow(id) {
    setSelectedRows((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedRows(new Set(rows.map((r) => getRowId(r))));
  }

  function deselectAll() {
    setSelectedRows(new Set());
  }

  function handleSort(col) {
    if (sort.column === col) {
      setSort({ column: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ column: col, dir: 'asc' });
    }
    setPage(1);
  }

  function handleFilterChange(col, val) {
    setFilters((f) => ({ ...f, [col]: val }));
    setPage(1);
  }

  async function handleSubmit(values) {
    const columns = new Set(allColumns);
    const cleaned = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v !== '') cleaned[k] = v;
    });
    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `/api/tables/${table}/${encodeURIComponent(getRowId(editing))}`
      : `/api/tables/${table}`;

    if (!editing) {
      if (columns.has('created_by')) cleaned.created_by = user?.empid;
      if (columns.has('created_at')) {
        cleaned.created_at = formatTimestamp(new Date());
      }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cleaned),
      });
      if (res.ok) {
        const params = new URLSearchParams({ page, perPage });
        if (sort.column) {
          params.set('sort', sort.column);
          params.set('dir', sort.dir);
        }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const data = await fetch(`/api/tables/${table}?${params.toString()}`, {
        credentials: 'include',
      }).then((r) => r.json());
      setRows(data.rows || []);
      setCount(data.count || 0);
        setSelectedRows(new Set());
        setShowForm(false);
        setEditing(null);
      } else {
        let message = 'Save failed';
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch (e) {
          // ignore json parse errors
        }
        alert(message);
      }
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm('Delete row?')) return;
    const res = await fetch(
      `/api/tables/${table}/${encodeURIComponent(getRowId(row))}`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (res.ok) {
      const params = new URLSearchParams({ page, perPage });
      if (sort.column) {
        params.set('sort', sort.column);
        params.set('dir', sort.dir);
      }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const data = await fetch(`/api/tables/${table}?${params.toString()}`, {
        credentials: 'include',
      }).then((r) => r.json());
      setRows(data.rows || []);
      setCount(data.count || 0);
      setSelectedRows(new Set());
    } else {
      alert('Delete failed');
    }
  }

  async function handleDeleteSelected() {
    if (selectedRows.size === 0) return;
    if (!window.confirm('Delete selected rows?')) return;
    for (const row of rows) {
      const id = getRowId(row);
      if (!selectedRows.has(id)) continue;
      const res = await fetch(
        `/api/tables/${table}/${encodeURIComponent(id)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        alert('Delete failed');
        return;
      }
    }
    const params = new URLSearchParams({ page, perPage });
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const data = await fetch(`/api/tables/${table}?${params.toString()}`, {
      credentials: 'include',
    }).then((r) => r.json());
    setRows(data.rows || []);
    setCount(data.count || 0);
    setSelectedRows(new Set());
  }

  if (!table) return null;

  const allColumns =
    columnMeta.length > 0
      ? columnMeta.map((c) => c.name)
      : rows[0]
      ? Object.keys(rows[0])
      : [];
  const hiddenColumns = ['password', 'created_by', 'created_at'];
  const columns = allColumns.filter((c) => !hiddenColumns.includes(c));

  const relationOpts = {};
  allColumns.forEach((c) => {
    if (relations[c] && refData[c]) {
      relationOpts[c] = refData[c];
    }
  });
  const labelMap = {};
  Object.entries(relationOpts).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
    });
  });
  const autoCols = new Set(autoInc);
  if (columnMeta.length === 0 && autoCols.size === 0 && allColumns.includes('id')) {
    autoCols.add('id');
  }
  const disabledFields = editing ? getKeyFields() : [];
  const formColumns = allColumns.filter(
    (c) =>
      !autoCols.has(c) && c !== 'created_at' && c !== 'created_by'
  );

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={openAdd} style={{ marginRight: '0.5rem' }}>
          Add Row
        </button>
        <button onClick={selectAll} style={{ marginRight: '0.5rem' }}>
          Select All
        </button>
        <button onClick={deselectAll} style={{ marginRight: '0.5rem' }}>
          Deselect All
        </button>
        {selectedRows.size > 0 && (
          <button onClick={handleDeleteSelected}>Delete Selected</button>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginBottom: '0.5rem',
          gap: '1rem',
        }}
      >
        <div>
          Rows per page:
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value));
            }}
            style={{ marginLeft: '0.25rem' }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ marginRight: '0.25rem' }}>
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem' }}
          >
            {'<'}
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem' }}
          >
            {'>>'}
          </button>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
              <input
                type="checkbox"
                checked={rows.length > 0 && selectedRows.size === rows.length}
                onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
              />
            </th>
            {columns.map((c) => (
              <th
                key={c}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', cursor: 'pointer' }}
                onClick={() => handleSort(c)}
              >
                {c}
                {sort.column === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Action</th>
          </tr>
          <tr>
            <th style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}></th>
            {columns.map((c) => (
              <th key={c} style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>
                {Array.isArray(relationOpts[c]) ? (
                  <select
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value=""></option>
                    {relationOpts[c].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={filters[c] || ''}
                    onChange={(e) => handleFilterChange(c, e.target.value)}
                    style={{ width: '100%' }}
                  />
                )}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '0.5rem' }}>
                No data.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id || JSON.stringify(r)}>
              <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                <input
                  type="checkbox"
                  checked={selectedRows.has(getRowId(r))}
                  onChange={() => toggleRow(getRowId(r))}
                />
              </td>
              {columns.map((c) => (
                <td key={c} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {relationOpts[c] ? labelMap[c][r[c]] || String(r[c]) : String(r[c])}
                </td>
              ))}
              <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                <button onClick={() => openEdit(r)}>Edit</button>
                <button onClick={() => handleDelete(r)} style={{ marginLeft: '0.5rem' }}>
                  Delete
                </button>
              </td>
            </tr>
      ))}
      </tbody>
      </table>
      <RowFormModal
        visible={showForm}
        onCancel={() => setShowForm(false)}
        onSubmit={handleSubmit}
        columns={formColumns}
        row={editing}
        relations={relationOpts}
        disabledFields={disabledFields}
      />
    </div>
  );
}
