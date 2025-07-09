import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

const layoutOpts = [
  'upper_left',
  'upper_right',
  'lower_left',
  'lower_right',
  'bottom_row',
  'hidden',
];

export default function PosTransactionConfig() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [config, setConfig] = useState({
    linked_tables: {},
    layout_positions: {},
    calculated_fields: [],
    pos_calculated_fields: {},
    status_rules: { field: 'status', pending: 'pending', posted: 'posted' },
  });

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setTables(data.filter((t) => t.startsWith('transactions_')))
      )
      .catch(() => setTables([]));

    fetch('/api/pos_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfig((c) => ({ ...c, ...data })))
      .catch(() => {});
  }, []);

  function toggleTable(tbl) {
    setConfig((c) => {
      const next = { ...c.linked_tables };
      if (next[tbl]) delete next[tbl];
      else next[tbl] = { type: 'single' };
      return { ...c, linked_tables: next };
    });
  }

  function changeType(tbl, type) {
    setConfig((c) => ({
      ...c,
      linked_tables: { ...c.linked_tables, [tbl]: { type } },
    }));
  }

  function changeLayout(tbl, pos) {
    setConfig((c) => ({
      ...c,
      layout_positions: { ...c.layout_positions, [tbl]: pos },
    }));
  }

  function addCalc() {
    setConfig((c) => ({
      ...c,
      calculated_fields: [...c.calculated_fields, { target: '', expression: '' }],
    }));
  }

  function updateCalc(idx, field, val) {
    setConfig((c) => {
      const arr = c.calculated_fields.slice();
      arr[idx] = { ...arr[idx], [field]: val };
      return { ...c, calculated_fields: arr };
    });
  }

  function removeCalc(idx) {
    setConfig((c) => {
      const arr = c.calculated_fields.slice();
      arr.splice(idx, 1);
      return { ...c, calculated_fields: arr };
    });
  }

  function addPosCalc() {
    setConfig((c) => {
      const next = { ...c.pos_calculated_fields };
      next[''] = '';
      return { ...c, pos_calculated_fields: next };
    });
  }

  function updatePosCalc(key, field, val) {
    setConfig((c) => {
      const next = { ...c.pos_calculated_fields };
      if (field === 'name') {
        const value = next[key];
        delete next[key];
        next[val] = value;
      } else {
        next[key] = val;
      }
      return { ...c, pos_calculated_fields: next };
    });
  }

  function removePosCalc(key) {
    setConfig((c) => {
      const next = { ...c.pos_calculated_fields };
      delete next[key];
      return { ...c, pos_calculated_fields: next };
    });
  }

  async function handleSave() {
    try {
      await fetch('/api/pos_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config }),
      });
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete configuration?')) return;
    try {
      await fetch('/api/pos_config', { method: 'DELETE', credentials: 'include' });
      addToast('Deleted', 'success');
    } catch {
      addToast('Failed to delete', 'error');
    }
  }

  return (
    <div>
      <h2>POS Transaction Configuration</h2>
      <h3>Linked Tables</h3>
      {tables.map((t) => (
        <div key={t} style={{ marginBottom: '0.25rem' }}>
          <label>
            <input
              type="checkbox"
              checked={!!config.linked_tables[t]}
              onChange={() => toggleTable(t)}
            />
            {t}
          </label>
          {config.linked_tables[t] && (
            <>
              <select
                value={config.linked_tables[t].type}
                onChange={(e) => changeType(t, e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                <option value="single">Single</option>
                <option value="multi">Multi</option>
              </select>
              <select
                value={config.layout_positions[t] || 'hidden'}
                onChange={(e) => changeLayout(t, e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                {layoutOpts.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      ))}

      <h3>Calculated Field Mapping</h3>
      {config.calculated_fields.map((c, idx) => (
        <div key={idx} style={{ marginBottom: '0.25rem' }}>
          <input
            type="text"
            placeholder="target"
            value={c.target}
            onChange={(e) => updateCalc(idx, 'target', e.target.value)}
          />
          <input
            type="text"
            placeholder="expression"
            value={c.expression}
            onChange={(e) => updateCalc(idx, 'expression', e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          />
          <button onClick={() => removeCalc(idx)} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        </div>
      ))}
      <button onClick={addCalc}>Add Mapping</button>

      <h3>POS-only Calculated Fields</h3>
      {Object.entries(config.pos_calculated_fields).map(([name, expr]) => (
        <div key={name} style={{ marginBottom: '0.25rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => updatePosCalc(name, 'name', e.target.value)}
          />
          <input
            type="text"
            value={expr}
            onChange={(e) => updatePosCalc(name, 'expr', e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          />
          <button onClick={() => removePosCalc(name)} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        </div>
      ))}
      <button onClick={addPosCalc}>Add POS Field</button>

      <h3>Status Rules</h3>
      <div>
        Field:
        <input
          type="text"
          value={config.status_rules.field}
          onChange={(e) =>
            setConfig((c) => ({ ...c, status_rules: { ...c.status_rules, field: e.target.value } }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
      </div>
      <div style={{ marginTop: '0.25rem' }}>
        Pending value:
        <input
          type="text"
          value={config.status_rules.pending}
          onChange={(e) =>
            setConfig((c) => ({ ...c, status_rules: { ...c.status_rules, pending: e.target.value } }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
      </div>
      <div style={{ marginTop: '0.25rem' }}>
        Posted value:
        <input
          type="text"
          value={config.status_rules.posted}
          onChange={(e) =>
            setConfig((c) => ({ ...c, status_rules: { ...c.status_rules, posted: e.target.value } }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleSave}>Save</button>
        <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
          Delete
        </button>
      </div>
    </div>
  );
}
