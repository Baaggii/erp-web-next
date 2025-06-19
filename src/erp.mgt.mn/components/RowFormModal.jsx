import React, { useState, useEffect, useRef } from 'react';
import SearchSelect from './SearchSelect.jsx';

export default function RowFormModal({
  visible,
  onCancel,
  onSubmit,
  columns,
  row,
  relations = {},
  disabledFields = [],
  labels = {},
}) {
  const [formVals, setFormVals] = useState(() => {
    const init = {};
    columns.forEach((c) => {
      init[c] = row ? String(row[c] ?? '') : '';
    });
    return init;
  });
  const inputRefs = useRef({});

  useEffect(() => {
    if (!visible) return;
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row ? String(row[c] ?? '') : '';
    });
    setFormVals(vals);
  }, [row, columns, visible]);

  function handleKeyDown(e, idx) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const keys = columns;
      for (let i = idx + 1; i < keys.length; i++) {
        const key = keys[i];
        if (!disabledFields.includes(key) && inputRefs.current[key]) {
          inputRefs.current[key].focus();
          return;
        }
      }
      e.target.form?.requestSubmit();
    }
  }

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
          {columns.map((c, idx) => (
            <div key={c} style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                {labels[c] || c}
              </label>
              {Array.isArray(relations[c]) ? (
                <SearchSelect
                  value={formVals[c]}
                  onChange={(val) =>
                    setFormVals((v) => ({ ...v, [c]: val }))
                  }
                  options={relations[c]}
                  disabled={row && disabledFields.includes(c)}
                  inputRef={(el) => (inputRefs.current[c] = el)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                />
              ) : (
                <input
                  type="text"
                  value={formVals[c]}
                  onChange={(e) =>
                    setFormVals((v) => ({ ...v, [c]: e.target.value }))
                  }
                  disabled={row && disabledFields.includes(c)}
                  style={{ width: '100%', padding: '0.5rem' }}
                  ref={(el) => (inputRefs.current[c] = el)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                />
              )}
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
