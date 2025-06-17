import React, { useEffect, useState } from 'react';

export default function HeaderMapEditor({ table }) {
  const [mapping, setMapping] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/headers`, { credentials: 'include' })
      .then((res) => res.json())
      .then((m) => setMapping(m))
      .catch(() => setMapping({}));
  }, [table]);

  if (!table) return null;

  const keys = Object.keys(mapping);
  if (keys.length === 0) return <p>No header map found.</p>;

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/tables/${encodeURIComponent(table)}/headers`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    });
    setSaving(false);
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>Header Translations</h3>
      {keys.map((k) => (
        <div key={k} style={{ marginBottom: '0.25rem' }}>
          {k}:
          <input
            value={mapping[k] || ''}
            onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}
            style={{ marginLeft: '0.5rem' }}
          />
        </div>
      ))}
      <button onClick={handleSave} disabled={saving} style={{ marginTop: '0.5rem' }}>
        Save
      </button>
    </div>
  );
}
