import React, { useEffect, useState } from 'react';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ column: '', dir: 'asc' });

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => res.json())
      .then(setTables)
      .catch((err) => console.error('Failed to load tables', err));
  }, []);

  useEffect(() => {
    if (selectedTable) {
      loadRows(selectedTable);
    }
  }, [selectedTable, page, perPage, filters, sort]);

  function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('perPage', perPage);
    if (sort.column) {
      params.set('sort', sort.column);
      params.set('dir', sort.dir);
    }
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }

  function loadRows(table) {
    const q = buildQuery();
    fetch(`/api/tables/${table}?${q}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setRows(data.rows);
        setTotal(data.count);
      })
      .catch((err) => console.error('Failed to fetch rows', err));
  }

  function handleSelect(e) {
    const t = e.target.value;
    setSelectedTable(t);
    setPage(1);
    setFilters({});
    setSort({ column: '', dir: 'asc' });
    if (t) {
      loadRows(t);
    } else {
      setRows([]);
      setTotal(0);
    }
  }

  async function handleEdit(row) {
      const updates = {};
      for (const key of Object.keys(row)) {
        if (key === 'id') continue;
        const val = prompt(`${key}?`, row[key]);
        if (val !== null && val !== String(row[key])) {
          updates[key] = val;
        }
      }
      if (Object.keys(updates).length === 0) return;

      let rowId = row.id;
      if (rowId === undefined) {
        if (selectedTable === 'company_module_licenses') {
          rowId = `${row.company_id}-${row.module_key}`;
        } else {
          alert('Cannot update row: no id column');
          return;
        }
      }
      const res = await fetch(
        `/api/tables/${selectedTable}/${encodeURIComponent(rowId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
        },
      );
    if (!res.ok) {
      alert('Update failed');
      return;
    }
    loadRows(selectedTable);
  }

  async function handleAdd() {
    if (rows.length === 0) return;
    const data = {};
    for (const key of Object.keys(rows[0])) {
      if (key === 'id') continue;
      const val = prompt(`${key}?`);
      if (val === null) return;
      data[key] = val;
    }
    const res = await fetch(`/api/tables/${selectedTable}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      alert('Insert failed');
      return;
    }
    loadRows(selectedTable);
  }

  async function handleDelete(row) {
    if (!confirm('Delete row?')) return;
    let rowId = row.id;
    if (rowId === undefined) {
      if (selectedTable === 'company_module_licenses') {
        rowId = `${row.company_id}-${row.module_key}`;
      } else {
        alert('Cannot delete row: no id column');
        return;
      }
    }
    const res = await fetch(
      `/api/tables/${selectedTable}/${encodeURIComponent(rowId)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (!res.ok) {
      alert('Delete failed');
      return;
    }
    loadRows(selectedTable);
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

  function handlePageChange(newPage) {
    setPage(newPage);
  }

  return (
    <div>
      <h2>Dynamic Tables</h2>
      <select value={selectedTable} onChange={handleSelect}>
        <option value="">-- select table --</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {rows.length > 0 && (
        <>
          <button onClick={handleAdd} style={{ marginTop: '0.5rem' }}>
            Add Row
          </button>
          <table
            style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                {Object.keys(rows[0]).map((k) => (
                  <th
                    key={k}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', cursor: 'pointer' }}
                    onClick={() => handleSort(k)}
                  >
                    {k}
                    {sort.column === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Action</th>
              </tr>
              <tr>
                {Object.keys(rows[0]).map((k) => (
                  <th key={k} style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>
                    <input
                      value={filters[k] || ''}
                      onChange={(e) => handleFilterChange(k, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={
                    r.id ??
                    (selectedTable === 'company_module_licenses'
                      ? `${r.company_id}-${r.module_key}`
                      : JSON.stringify(r))
                  }
                >
                  {Object.keys(rows[0]).map((k) => (
                    <td key={k} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                      {String(r[k])}
                    </td>
                  ))}
                  <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                    <button onClick={() => handleEdit(r)}>Edit</button>
                    <button onClick={() => handleDelete(r)} style={{ marginLeft: '0.5rem' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '0.5rem' }}>
            <button disabled={page <= 1} onClick={() => handlePageChange(1)}>
              « First
            </button>
            <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              Prev
            </button>
            <span style={{ margin: '0 0.5rem' }}>
              Page {page} / {Math.ceil(total / perPage) || 1}
            </span>
            <button
              disabled={page >= Math.ceil(total / perPage)}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </button>
            <button
              disabled={page >= Math.ceil(total / perPage)}
              onClick={() => handlePageChange(Math.ceil(total / perPage))}
            >
              Last »
            </button>
          </div>
        </>
      )}
    </div>
  );
}
