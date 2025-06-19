import React, { useState, useEffect, useRef } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';

export default function RowFormModal({
  visible,
  onCancel,
  onSubmit,
  columns,
  row,
  relations = {},
  relationConfigs = {},
  disabledFields = [],
  labels = {},
  requiredFields = [],
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
    inputRefs.current = {};
  }, [row, columns, visible]);

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

  function handleKeyDown(e, col) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const enabled = columns.filter((c) => !disabledFields.includes(c));
    const idx = enabled.indexOf(col);
    const next = enabled[idx + 1];
    if (next && inputRefs.current[next]) {
      inputRefs.current[next].focus();
      return;
    }
    if (!next) {
      onSubmit(formVals);
    }
  }

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
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                {labels[c] || c}
                {requiredFields.includes(c) && (
                  <span style={{ color: 'red' }}>*</span>
                )}
              </label>
              {relationConfigs[c] ? (
                <AsyncSearchSelect
                  table={relationConfigs[c].table}
                  searchColumn={relationConfigs[c].column}
                  labelFields={relationConfigs[c].displayFields || []}
                  value={formVals[c]}
                  onChange={(val) =>
                    setFormVals((v) => ({ ...v, [c]: val }))
                  }
                  disabled={row && disabledFields.includes(c)}
                  onKeyDown={(e) => handleKeyDown(e, c)}
                />
              ) : Array.isArray(relations[c]) ? (
                <select
                  ref={(el) => (inputRefs.current[c] = el)}
                  value={formVals[c]}
                  onChange={(e) =>
                    setFormVals((v) => ({ ...v, [c]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, c)}
                  disabled={row && disabledFields.includes(c)}
                  style={{ width: '100%', padding: '0.5rem' }}
                >
                  <option value="">-- select --</option>
                  {relations[c].map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={(el) => (inputRefs.current[c] = el)}
                  type="text"
                  value={formVals[c]}
                  onChange={(e) =>
                    setFormVals((v) => ({ ...v, [c]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, c)}
                  disabled={row && disabledFields.includes(c)}
                  style={{ width: '100%', padding: '0.5rem' }}
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
