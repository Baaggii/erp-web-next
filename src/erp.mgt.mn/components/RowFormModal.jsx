import React, { useState, useEffect } from 'react';

export default function RowFormModal({ visible, onCancel, onSubmit, columns, row }) {
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    columns.forEach((c) => {
      init[c] = row ? String(row[c] ?? '') : '';
    });
    return init;
  });

  useEffect(() => {
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row ? String(row[c] ?? '') : '';
    });
    setFormVals(vals);
  }, [row, columns]);

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
        <h3 style={{ marginTop: 0 }}>{row ? 'Edit Row' : 'Add Row'}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(formVals);
          }}
        >
          {columns.map((c) => (
            <div key={c} style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>{c}</label>
              <input
                type="text"
                value={formVals[c]}
                onChange={(e) =>
                  setFormVals((v) => ({ ...v, [c]: e.target.value }))
                }
                disabled={row && c === 'id'}
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </div>
          ))}
          <div style={{ textAlign: 'right' }}>
            <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
