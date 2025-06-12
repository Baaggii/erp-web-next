import React, { useEffect, useState } from 'react';
import RowFormModal from './RowFormModal.jsx';

export default function TableManager({ table }) {
  const [rows, setRows] = useState([]);
  const [relations, setRelations] = useState({});
  const [refData, setRefData] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${table}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setRows(data.rows || []));
    fetch(`/api/tables/${table}/relations`, { credentials: 'include' })
      .then((res) => res.json())
      .then((rels) => {
        setRelations(
          rels.reduce((acc, r) => {
            acc[r.COLUMN_NAME] = r;
            return acc;
          }, {})
        );
      });
  }, [table]);

  useEffect(() => {
    Object.values(relations).forEach((rel) => {
      const col = rel.COLUMN_NAME;
      if (refData[col]) return;
      fetch(`/api/tables/${rel.REFERENCED_TABLE_NAME}?perPage=100`, {
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) =>
          setRefData((d) => ({
            ...d,
            [col]: data.rows.map((r) => ({
              value: r[rel.REFERENCED_COLUMN_NAME],
              label:
                r.name || r.label || r[rel.REFERENCED_COLUMN_NAME] || 'value',
            })),
          }))
        );
    });
  }, [relations]);

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(values) {
    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `/api/tables/${table}/${encodeURIComponent(editing.id)}`
      : `/api/tables/${table}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(values),
    });
    if (res.ok) {
      const data = await fetch(`/api/tables/${table}`, {
        credentials: 'include',
      }).then((r) => r.json());
      setRows(data.rows || []);
      setShowForm(false);
      setEditing(null);
    } else {
      alert('Save failed');
    }
  }

  async function handleDelete(row) {
    if (!window.confirm('Delete row?')) return;
    const res = await fetch(`/api/tables/${table}/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== row.id));
    } else {
      alert('Delete failed');
    }
  }

  if (!table) return null;
  if (rows.length === 0) return <p>No data.</p>;

  const columns = Object.keys(rows[0]);
  const relationOpts = {};
  columns.forEach((c) => {
    if (relations[c] && refData[c]) {
      relationOpts[c] = refData[c];
    }
  });

  return (
    <div>
      <button onClick={openAdd} style={{ marginBottom: '0.5rem' }}>
        Add Row
      </button>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            {columns.map((c) => (
              <th key={c} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                {c}
              </th>
            ))}
            <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || JSON.stringify(r)}>
              {columns.map((c) => (
                <td key={c} style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {String(r[c])}
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
        columns={columns}
        row={editing}
        relations={relationOpts}
      />
    </div>
  );
}
