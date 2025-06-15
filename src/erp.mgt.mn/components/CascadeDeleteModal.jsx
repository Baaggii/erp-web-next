import React, { useEffect, useState } from 'react';

export default function CascadeDeleteModal({ visible, references = [], onCancel, onConfirm }) {
  const [rowsByTable, setRowsByTable] = useState({});

  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    async function load() {
      const data = {};
      for (const ref of references) {
        try {
          const params = new URLSearchParams({ perPage: 5 });
          params.set(ref.column, ref.value);
          const res = await fetch(`/api/tables/${encodeURIComponent(ref.table)}?${params.toString()}`, { credentials: 'include' });
          const json = await res.json();
          if (!canceled) data[ref.table] = json.rows || [];
        } catch {
          /* ignore errors */
        }
      }
      if (!canceled) setRowsByTable(data);
    }
    load();
    return () => {
      canceled = true;
    };
  }, [visible, references]);

  if (!visible) return null;

  const overlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const modal = {
    backgroundColor: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    maxHeight: '90vh',
    overflowY: 'auto',
    minWidth: '300px',
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>Delete Related Records?</h3>
        {references.map((r) => (
          <div key={`${r.table}-${r.column}-${r.value}`} style={{ marginBottom: '1rem' }}>
            <strong>{r.table}</strong> ({r.count})
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.25rem' }}>
              <tbody>
                {(rowsByTable[r.table] || []).map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).slice(0, 3).map((v, i) => (
                      <td key={i} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ textAlign: 'right' }}>
          <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>Delete All</button>
        </div>
      </div>
    </div>
  );
}
