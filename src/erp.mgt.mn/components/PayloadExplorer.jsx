import React, { useMemo, useState } from 'react';

export default function PayloadExplorer({ fields = [], selectedField, onSelectField, onStartDrag }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return fields;
    return fields.filter((field) => field.path.toLowerCase().includes(normalized));
  }, [fields, query]);

  return (
    <div style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Event Payload Fields</h3>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter payload fields"
        style={{ width: '100%', marginBottom: 8 }}
      />
      {filtered.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No payload fields discovered for this event type yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {filtered.map((field) => (
            <li key={field.path} style={{ marginBottom: 4 }}>
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', field.path);
                  onStartDrag?.(field.path);
                }}
                onClick={() => onSelectField?.(field.path)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: field.path === selectedField ? '#1d4ed8' : '#2563eb',
                  fontWeight: field.path === selectedField ? 700 : 400,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {field.path}
              </button>
              <span style={{ marginLeft: 8, color: '#6b7280', fontSize: 12 }}>{field.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
