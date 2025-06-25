import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function RelationsConfig() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [idField, setIdField] = useState('');
  const [displayFields, setDisplayFields] = useState([]);

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { idField: '', displayFields: [] }))
      .then((cfg) => {
        setIdField(cfg.idField || '');
        setDisplayFields(cfg.displayFields || []);
      })
      .catch(() => {
        setIdField('');
        setDisplayFields([]);
      });
  }, [table]);

  function toggleDisplayField(f) {
    setDisplayFields((list) =>
      list.includes(f) ? list.filter((x) => x !== f) : [...list, f],
    );
  }

  async function handleSave() {
    try {
      const res = await fetch('/api/display_fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table, idField, displayFields }),
      });
      if (!res.ok) throw new Error('failed');
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete configuration?')) return;
    try {
      const params = new URLSearchParams({ table });
      const res = await fetch(`/api/display_fields?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      setIdField('');
      setDisplayFields([]);
      addToast('Deleted', 'success');
    } catch {
      addToast('Failed to delete', 'error');
    }
  }

  return (
    <div>
      <h2>Relations Display Fields</h2>
      <div>
        <label>
          Table:
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">-- select table --</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {table && (
          <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        )}
      </div>
      {table && (
        <div style={{ marginTop: '1rem' }}>
          <div>
            <label>
              ID Field:
              <select
                value={idField}
                onChange={(e) => setIdField(e.target.value)}
              >
                <option value="">-- none --</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            Display Fields:
            {columns.map((c) => (
              <label key={c} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={displayFields.includes(c)}
                  onChange={() => toggleDisplayField(c)}
                />
                {c}
              </label>
            ))}
          </div>
          <button onClick={handleSave} style={{ marginTop: '0.5rem' }}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
