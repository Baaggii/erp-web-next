import React, { useState, useEffect, useRef } from 'react';
import AsyncSearchSelect from './AsyncSearchSelect.jsx';
import Modal from './Modal.jsx';

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
  const [errors, setErrors] = useState({});
  const [submitLocked, setSubmitLocked] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const vals = {};
    columns.forEach((c) => {
      vals[c] = row ? String(row[c] ?? '') : '';
    });
    setFormVals(vals);
    inputRefs.current = {};
    setErrors({});
  }, [row, columns, visible]);

  if (!visible) return null;

  const formStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem 1rem',
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
      submitForm();
    }
  }

  async function submitForm() {
    if (submitLocked) return;
    setSubmitLocked(true);
    const errs = {};
    requiredFields.forEach((f) => {
      if (columns.includes(f) && !formVals[f]) {
        errs[f] = 'Please enter value';
      }
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      await Promise.resolve(onSubmit(formVals));
    }
    setSubmitLocked(false);
  }

  return (
    <Modal visible={visible} title={row ? 'Edit Row' : 'Add Row'} onClose={onCancel} width="70vw">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
        style={formStyle}
      >
          {columns.map((c) => {
            const err = errors[c];
            const inputStyle = {
              width: '100%',
              padding: '0.5rem',
              border: err ? '1px solid red' : '1px solid #ccc',
            };
            return (
            <div key={c} style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>
                {labels[c] || c}
                {requiredFields.includes(c) && (
                  <span style={{ color: 'red' }}>*</span>
                )}
              </label>
              {relationConfigs[c] ? (
                <AsyncSearchSelect
                  title={labels[c] || c}
                  table={relationConfigs[c].table}
                  searchColumn={relationConfigs[c].column}
                  labelFields={relationConfigs[c].displayFields || []}
                  value={formVals[c]}
                  onChange={(val) =>
                    setFormVals((v) => ({ ...v, [c]: val }))
                  }
                  disabled={row && disabledFields.includes(c)}
                  onKeyDown={(e) => handleKeyDown(e, c)}
                  inputRef={(el) => (inputRefs.current[c] = el)}
                />
              ) : Array.isArray(relations[c]) ? (
                <select
                  title={labels[c] || c}
                  ref={(el) => (inputRefs.current[c] = el)}
                  value={formVals[c]}
                  onChange={(e) =>
                    setFormVals((v) => ({ ...v, [c]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, c)}
                  disabled={row && disabledFields.includes(c)}
                  style={inputStyle}
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
                  title={labels[c] || c}
                  ref={(el) => (inputRefs.current[c] = el)}
                  type="text"
                  value={formVals[c]}
                  onChange={(e) =>
                    setFormVals((v) => ({ ...v, [c]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, c)}
                  disabled={row && disabledFields.includes(c)}
                  style={inputStyle}
                />
              )}
              {err && (
                <div style={{ color: 'red', fontSize: '0.8rem' }}>{err}</div>
              )}
            </div>
          );
          })}
        <div style={{ textAlign: 'right', gridColumn: '1 / span 2' }}>
          <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
        <div style={{ marginTop: '0.5rem', gridColumn: '1 / span 2', fontSize: '0.85rem', color: '#555' }}>
          Press <strong>Enter</strong> to move to next field. Use arrow keys to navigate selections.
        </div>
      </form>
    </Modal>
  );
}
