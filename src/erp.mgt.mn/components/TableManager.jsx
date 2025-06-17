import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import RowFormModal from './RowFormModal.jsx';
import CascadeDeleteModal from './CascadeDeleteModal.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function TableManager({ table, refreshId = 0 }) {
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
  const [localRefresh, setLocalRefresh] = useState(0);
  const [deleteInfo, setDeleteInfo] = useState(null); // { id, refs }
  const [showCascade, setShowCascade] = useState(false);
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
    setRows([]);
    setCount(0);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    setRelations({});
    setRefData({});
    setColumnMeta([]);
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
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
    fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (canceled) return;
        setRows(data.rows || []);
        setCount(data.count || 0);
        // clear selections when data changes
        setSelectedRows(new Set());
      });
    return () => {
      canceled = true;
    };
  }, [table, page, perPage, filters, sort, refreshId, localRefresh]);

  useEffect(() => {
    setSelectedRows(new Set());
  }, [table, page, perPage, filters, sort, refreshId, localRefresh]);

  function getRowId(row) {
    const keys = getKeyFields();
    if (keys.length === 0) return undefined;
    const idVal = keys.length === 1 ? row[keys[0]] : keys.map((k) => row[k]).join('-');
    return idVal;
  }

  function getKeyFields() {
    const keys = columnMeta
      .filter((c) => c.key === 'PRI')
      .map((c) => c.name);
    let result = keys;
    if (result.length === 0) {
      if (columnMeta.some((c) => c.name === 'id')) result = ['id'];
      else if (rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id')) {
        result = ['id'];
      }
    }
    return result;
  }

  async function ensureColumnMeta() {
    if (columnMeta.length > 0 || !table) return;
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
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
    if (getRowId(row) === undefined) {
      alert('Cannot edit rows without a primary key');
      return;
    }
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

  function selectCurrentPage() {
    setSelectedRows(new Set(rows.map((r) => getRowId(r)).filter((id) => id !== undefined)));
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
    setSelectedRows(new Set());
  }

  function handleFilterChange(col, val) {
    setFilters((f) => ({ ...f, [col]: val }));
    setPage(1);
    setSelectedRows(new Set());
  }

  async function handleSubmit(values) {
    const columns = new Set(allColumns);
    const cleaned = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v !== '') cleaned[k] = v;
    });
    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(getRowId(editing))}`
      : `/api/tables/${encodeURIComponent(table)}`;

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
      const data = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
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

  async function executeDeleteRow(id, cascade) {
    const res = await fetch(
      `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
        cascade ? '?cascade=true' : ''
      }`,
      { method: 'DELETE', credentials: 'include' },
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
      const data = await fetch(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        { credentials: 'include' },
      ).then((r) => r.json());
      setRows(data.rows || []);
      setCount(data.count || 0);
      setSelectedRows(new Set());
    } else {
      let message = 'Delete failed';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore json errors
      }
      alert(message);
    }
  }

  async function handleDelete(row) {
    const id = getRowId(row);
    if (id === undefined) {
      alert('Delete failed: table has no primary key');
      return;
    }
    try {
      const refRes = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
        { credentials: 'include' }
      );
      if (refRes.ok) {
        const refs = await refRes.json();
        const total = Array.isArray(refs)
          ? refs.reduce((a, r) => a + (r.count || 0), 0)
          : 0;
        if (total > 0) {
          setDeleteInfo({ id, refs });
          setShowCascade(true);
          return;
        }
        if (!window.confirm('Delete row?')) return;
        await executeDeleteRow(id, false);
        return;
      }
    } catch {
      // ignore error and fall back to confirm
    }
    if (!window.confirm('Delete row and related records?')) return;
    await executeDeleteRow(id, true);
  }

  async function confirmCascadeDelete() {
    if (!deleteInfo) return;
    await executeDeleteRow(deleteInfo.id, true);
    setShowCascade(false);
    setDeleteInfo(null);
  }

  async function handleDeleteSelected() {
    if (selectedRows.size === 0) return;
    const cascadeMap = new Map();
    let hasRelated = false;
    for (const id of selectedRows) {
      if (id === undefined) {
        alert('Delete failed: table has no primary key');
        return;
      }
      try {
        const refRes = await fetch(
          `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}/references`,
          { credentials: 'include' }
        );
        if (refRes.ok) {
          const refs = await refRes.json();
          const total = Array.isArray(refs)
            ? refs.reduce((a, r) => a + (r.count || 0), 0)
            : 0;
          cascadeMap.set(id, total > 0);
          if (total > 0) hasRelated = true;
        } else {
          cascadeMap.set(id, true);
          hasRelated = true;
        }
      } catch {
        cascadeMap.set(id, true);
        hasRelated = true;
      }
    }

    const count = selectedRows.size;
    const confirmMsg = hasRelated
      ? `Delete ${count} selected rows and related records?`
      : `Delete ${count} selected rows?`;
    if (!window.confirm(confirmMsg)) return;

    for (const id of selectedRows) {
      const cascade = cascadeMap.get(id);
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}${
          cascade ? '?cascade=true' : ''
        }`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        let message = `Delete failed for ${id}`;
        try {
          const data = await res.json();
          if (data && data.message) message += `: ${data.message}`;
        } catch {
          // ignore json errors
        }
        alert(message);
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
    const data = await fetch(`/api/tables/${encodeURIComponent(table)}?${params.toString()}`, {
      credentials: 'include',
    }).then((r) => r.json());
    setRows(data.rows || []);
    setCount(data.count || 0);
    setSelectedRows(new Set());
  }

  function refreshRows() {
    setLocalRefresh((r) => r + 1);
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
      !autoCols.has(c) && c !== 'created_at' && c !== 'created_by'
  );

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={openAdd} style={{ marginRight: '0.5rem' }}>
          Add Row
        </button>
        <button onClick={selectCurrentPage} style={{ marginRight: '0.5rem' }}>
          Select All
        </button>
        <button onClick={deselectAll} style={{ marginRight: '0.5rem' }}>
          Deselect All
        </button>
        <button onClick={refreshRows} style={{ marginRight: '0.5rem' }}>
          Refresh Table
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
                checked={
                  rows.length > 0 &&
                  rows.every((r) => {
                    const rid = getRowId(r);
                    return rid !== undefined && selectedRows.has(rid);
                  })
                }
                onChange={(e) => (e.target.checked ? selectCurrentPage() : deselectAll())}
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
                {(() => {
                  const rid = getRowId(r);
                  return (
                    <input
                      type="checkbox"
                      disabled={rid === undefined}
                      checked={rid !== undefined && selectedRows.has(rid)}
                      onChange={() => rid !== undefined && toggleRow(rid)}
                    />
                  );
                })()}
              </td>
              {columns.map((c) => (
                <td key={c} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {relationOpts[c] ? labelMap[c][r[c]] || String(r[c]) : String(r[c])}
                </td>
              ))}
              <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                {(() => {
                  const rid = getRowId(r);
                  return (
                    <>
                      <button onClick={() => openEdit(r)} disabled={rid === undefined}>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={rid === undefined}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Delete
                      </button>
                    </>
                  );
                })()}
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
      <CascadeDeleteModal
        visible={showCascade}
        references={deleteInfo?.refs || []}
        onCancel={() => {
          setShowCascade(false);
          setDeleteInfo(null);
        }}
        onConfirm={confirmCascadeDelete}
      />
    </div>
  );
}
