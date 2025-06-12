import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import ErrorMessage from './ErrorMessage.jsx';

async function parseJSON(res) {
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('Invalid server response');
  }
  try {
    return await res.json();
  } catch {
    throw new Error('Invalid server response');
  }
}

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
  const [error, setError] = useState('');
  const { user } = useContext(AuthContext);

  function computeAutoInc(meta) {
    const auto = meta
      .filter(
        (c) =>
          typeof c.extra === 'string' &&
          c.extra.toLowerCase().includes('auto_increment'),
      )
      .map((c) => c.name);
    if (auto.length === 0) {
      const pk = meta.filter((c) => c.key === 'PRI').map((c) => c.name);
      if (pk.length === 1) return new Set(pk);
    }
    return new Set(auto);
  }

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    setError('');
    setRows([]);
    setCount(0);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    setRelations({});
    setRefData({});
    setColumnMeta([]);
    fetch(`/api/tables/${table}/relations`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load table relations');
        return parseJSON(res);
      })
      .then((rels) => {
        if (canceled) return;
        setRelations(
          rels.reduce((acc, r) => {
            acc[r.COLUMN_NAME] = r;
            return acc;
          }, {})
        );
      })
      .catch((err) => {
        if (!canceled) {
          console.error('Failed to load table relations', err);
          setError(err.message);
        }
      });
    fetch(`/api/tables/${table}/columns`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load column metadata');
        return parseJSON(res);
      })
      .then((cols) => {
        if (canceled) return;
        setColumnMeta(cols);
        setAutoInc(computeAutoInc(cols));
      })
      .catch((err) => {
        if (!canceled) {
          console.error('Failed to load column metadata', err);
          setError(err.message);
        }
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    setAutoInc(computeAutoInc(columnMeta));
  }, [columnMeta]);

  async function fetchRows(currentPage = page) {
    if (!table) return { rows: [], count: 0 };
    const params = new URLSearchParams({ page: currentPage, perPage });
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    try {
      const res = await fetch(`/api/tables/${table}?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Failed to load rows');
      }
      const json = await parseJSON(res);
      setError('');
      return json;
    } catch (err) {
      console.error('Failed to load rows', err);
      setError(err.message);
      return { rows: [], count: 0 };
    }
  }

  useEffect(() => {
    if (!table) return;
    let canceled = false;
    fetchRows().then((data) => {
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
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load reference data');
          return parseJSON(res);
        })
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
        })
        .catch((err) => {
          if (!canceled) {
            console.error('Failed to load reference data', err);
            setError(err.message);
          }
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
    if (columnMeta.length > 0 || !table) return true;
    try {
      const res = await fetch(`/api/tables/${table}/columns`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Failed to fetch column metadata');
      }
      const cols = await parseJSON(res);
      if (Array.isArray(cols) && cols.length > 0) {
        setColumnMeta(cols);
        setAutoInc(computeAutoInc(cols));
        setError('');
        return true;
      }
      throw new Error('Invalid server response');
    } catch (err) {
      console.error('Failed to fetch column metadata', err);
      setError(err.message);
      return false;
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Save failed');
      }
      const data = await fetchRows();
      setRows(data.rows || []);
      setCount(data.count || 0);
      setSelectedRows(new Set());
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      console.error('Failed to save row', err);
      setError(err.message);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm('Delete row?')) return;
    if (!(await ensureColumnMeta())) return;
    try {
      const res = await fetch(
        `/api/tables/${table}/${encodeURIComponent(getRowId(row))}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Delete failed');
      }
      const data = await fetchRows();
      setRows(data.rows || []);
      setCount(data.count || 0);
      const last = Math.max(1, Math.ceil((data.count || 0) / perPage));
      if (page > last) setPage(last);
      setSelectedRows(new Set());
      setError('');
    } catch (err) {
      console.error('Failed to delete row', err);
      setError(err.message);
    }
  }

  async function handleDeleteSelected() {
    if (selectedRows.size === 0) return;
    if (!window.confirm('Delete selected rows?')) return;
    if (!(await ensureColumnMeta())) return;
    for (const row of rows) {
      const id = getRowId(row);
      if (!selectedRows.has(id)) continue;
      try {
        const res = await fetch(
          `/api/tables/${table}/${encodeURIComponent(id)}`,
          { method: 'DELETE', credentials: 'include' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message || 'Delete failed');
        }
      } catch (err) {
        console.error('Failed to delete row', err);
        setError(err.message);
        return;
      }
    }
    const data = await fetchRows();
    setRows(data.rows || []);
    setCount(data.count || 0);
    const last = Math.max(1, Math.ceil((data.count || 0) / perPage));
    if (page > last) setPage(last);
    setSelectedRows(new Set());
    setError('');
  }

  if (!table) return null;

  const allColumns =
    columnMeta.length > 0
      ? columnMeta.map((c) => c.name)
      : rows[0]
      ? Object.keys(rows[0])
      : [];
  const hiddenColumns = allColumns
    .filter((c) => c.toLowerCase().includes('password'))
    .concat(['created_by', 'created_at']);
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
  if (columnMeta.length > 0 && autoCols.size === 0) {
    const pk = columnMeta.filter((c) => c.key === 'PRI').map((c) => c.name);
    if (pk.length === 1) autoCols.add(pk[0]);
  }
  if (columnMeta.length === 0 && autoCols.size === 0 && allColumns.includes('id')) {
    autoCols.add('id');
  }
  const disabledFields = editing ? getKeyFields() : [];
  const formColumns = allColumns.filter(
    (c) =>
      !autoCols.has(c) &&
      c !== 'created_at' &&
      c !== 'created_by'
  );

  return (
    <div>
      <ErrorMessage message={error} />
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={openAdd} style={{ marginRight: '0.5rem', padding: '0.4rem 0.75rem' }}>
          Add Row
        </button>
        <button onClick={selectAll} style={{ marginRight: '0.5rem', padding: '0.4rem 0.75rem' }}>
          Select All
        </button>
        <button onClick={deselectAll} style={{ marginRight: '0.5rem', padding: '0.4rem 0.75rem' }}>
          Deselect All
        </button>
        {selectedRows.size > 0 && (
          <button onClick={handleDeleteSelected} style={{ padding: '0.4rem 0.75rem' }}>Delete Selected</button>
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
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            style={{ marginRight: '0.25rem', padding: '0.3rem 0.6rem' }}
          >
            {'<<'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ marginRight: '0.25rem', padding: '0.3rem 0.6rem' }}
          >
            {'<'}
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(count / perPage))}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(count / perPage), p + 1))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem', padding: '0.3rem 0.6rem' }}
          >
            {'>'}
          </button>
          <button
            onClick={() => setPage(Math.ceil(count / perPage))}
            disabled={page >= Math.ceil(count / perPage)}
            style={{ marginLeft: '0.25rem', padding: '0.3rem 0.6rem' }}
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
                <button onClick={() => openEdit(r)} style={{ padding: '0.3rem 0.6rem' }}>Edit</button>
                <button onClick={() => handleDelete(r)} style={{ marginLeft: '0.5rem', padding: '0.3rem 0.6rem' }}>
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
