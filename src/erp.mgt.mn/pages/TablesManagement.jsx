import React, { useEffect, useState } from 'react';

export default function TablesManagement() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => res.json())
      .then(setTables)
      .catch((err) => console.error('Failed to load tables', err));
  }, []);

  function loadRows(table) {
    fetch(`/api/tables/${table}`, { credentials: 'include' })
      .then((res) => res.json())
      .then(setRows)
      .catch((err) => console.error('Failed to fetch rows', err));
  }

  function handleSelect(e) {
    const t = e.target.value;
    setSelectedTable(t);
    if (t) {
      loadRows(t);
    } else {
      setRows([]);
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
        <table
          style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              {Object.keys(rows[0]).map((k) => (
                <th key={k} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {k}
                </th>
              ))}
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Action</th>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
