import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

const emptyConfig = {
  tables: [],
  calcFields: [],
  posFields: [],
  statusField: { field: '', created: '', beforePost: '', posted: '' },
};

export default function PosTxnConfig() {
  const { addToast } = useToast();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [tableOptions, setTableOptions] = useState([]);
  const [config, setConfig] = useState(emptyConfig);

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));

    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setTableOptions(
          data.filter(
            (t) => t.startsWith('transactions_') && t !== 'transactions_pos',
          ),
        ),
      )
      .catch(() => setTableOptions([]));
  }, []);

  async function loadConfig(n) {
    if (!n) {
      setName('');
      setConfig({ ...emptyConfig });
      return;
    }
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(n)}`, {
        credentials: 'include',
      });
      const cfg = res.ok ? await res.json() : emptyConfig;
      setName(n);
      setConfig({ ...emptyConfig, ...(cfg || {}) });
    } catch {
      setName(n);
      setConfig({ ...emptyConfig });
    }
  }

  function addTable() {
    setConfig((c) => ({
      ...c,
      tables: [
        ...c.tables,
        { table: '', transaction: '', type: 'single', position: 'upper_left' },
      ],
    }));
  }

  function updateTable(idx, key, value) {
    setConfig((c) => ({
      ...c,
      tables: c.tables.map((t, i) => (i === idx ? { ...t, [key]: value } : t)),
    }));
  }

  function removeTable(idx) {
    setConfig((c) => ({
      ...c,
      tables: c.tables.filter((_, i) => i !== idx),
    }));
  }

  async function handleSave() {
    if (!name) {
      addToast('Name required', 'error');
      return;
    }
    await fetch('/api/pos_txn_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, config }),
    });
    addToast('Saved', 'success');
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => {});
  }

  async function handleDelete() {
    if (!name) return;
    if (!window.confirm('Delete configuration?')) return;
    await fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    addToast('Deleted', 'success');
    setName('');
    setConfig({ ...emptyConfig });
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => {});
  }

  function handleAddCalc() {
    setConfig((c) => ({
      ...c,
      calcFields: [...c.calcFields, { field: '', table: '', column: '', agg: 'SUM' }],
    }));
  }

  function updateCalc(idx, key, value) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)),
    }));
  }

  function removeCalc(idx) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.filter((_, i) => i !== idx),
    }));
  }

  function handleAddPos() {
    setConfig((c) => ({
      ...c,
      posFields: [...c.posFields, { field: '', expr: '' }],
    }));
  }

  function updatePos(idx, key, value) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)),
    }));
  }

  function removePos(idx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div>
      <h2>POS Transaction Config</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select value={name} onChange={(e) => loadConfig(e.target.value)}>
          <option value="">-- select config --</option>
          {Object.keys(configs).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Config name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginLeft: '0.5rem' }}
        />
        {name && (
          <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        )}
      </div>
      <div>
        <h3>Linked Tables</h3>
        {config.tables.map((t, idx) => (
          <div key={idx} style={{ marginBottom: '0.5rem' }}>
            <select
              value={t.table}
              onChange={(e) => updateTable(idx, 'table', e.target.value)}
            >
              <option value="">-- table --</option>
              {tableOptions.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {tbl}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Transaction name"
              value={t.transaction}
              onChange={(e) => updateTable(idx, 'transaction', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
            <select
              value={t.type}
              onChange={(e) => updateTable(idx, 'type', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="single">Single</option>
              <option value="multi">Multi</option>
            </select>
            <select
              value={t.position}
              onChange={(e) => updateTable(idx, 'position', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="top_row">top_row</option>
              <option value="upper_left">upper_left</option>
              <option value="upper_right">upper_right</option>
              <option value="lower_left">lower_left</option>
              <option value="lower_right">lower_right</option>
              <option value="bottom_row">bottom_row</option>
              <option value="hidden">hidden</option>
            </select>
            <button onClick={() => removeTable(idx)} style={{ marginLeft: '0.5rem' }}>
              Remove
            </button>
          </div>
        ))}
        <button onClick={addTable}>Add Table</button>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <h3>Calculated Fields</h3>
        {config.calcFields.map((f, idx) => (
          <div key={idx} style={{ marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Field"
              value={f.field}
              onChange={(e) => updateCalc(idx, 'field', e.target.value)}
            />
            <input
              type="text"
              placeholder="Table"
              value={f.table}
              onChange={(e) => updateCalc(idx, 'table', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
            <input
              type="text"
              placeholder="Column"
              value={f.column}
              onChange={(e) => updateCalc(idx, 'column', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
            <select
              value={f.agg}
              onChange={(e) => updateCalc(idx, 'agg', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              <option value="SUM">SUM</option>
              <option value="AVG">AVG</option>
            </select>
            <button onClick={() => removeCalc(idx)} style={{ marginLeft: '0.5rem' }}>
              Remove
            </button>
          </div>
        ))}
        <button onClick={handleAddCalc}>Add Calculated</button>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <h3>POS-only Fields</h3>
        {config.posFields.map((f, idx) => (
          <div key={idx} style={{ marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Field"
              value={f.field}
              onChange={(e) => updatePos(idx, 'field', e.target.value)}
            />
            <input
              type="text"
              placeholder="Expression"
              value={f.expr}
              onChange={(e) => updatePos(idx, 'expr', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
            <button onClick={() => removePos(idx)} style={{ marginLeft: '0.5rem' }}>
              Remove
            </button>
          </div>
        ))}
        <button onClick={handleAddPos}>Add POS Field</button>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <h3>Status Mapping</h3>
        <input
          type="text"
          placeholder="Status Field"
          value={config.statusField.field}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, field: e.target.value },
            }))
          }
        />
        <input
          type="text"
          placeholder="Created"
          value={config.statusField.created}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, created: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="Before Post"
          value={config.statusField.beforePost}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, beforePost: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="Posted"
          value={config.statusField.posted}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              statusField: { ...c.statusField, posted: e.target.value },
            }))
          }
          style={{ marginLeft: '0.5rem' }}
        />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}
