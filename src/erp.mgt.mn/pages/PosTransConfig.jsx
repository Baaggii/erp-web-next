import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function PosTransConfigPage() {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [name, setName] = useState('');
  const [config, setConfig] = useState({
    table: '',
    multi: false,
    position: 'hidden',
    calcFields: [],
    posCalc: {},
    statusBefore: '',
    statusAfter: '',
  });

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const list = [];
        Object.entries(data).forEach(([tbl, names]) => {
          Object.keys(names).forEach((n) => {
            list.push({ name: n, table: tbl });
          });
        });
        setTransactions(list);
      })
      .catch(() => setTransactions([]));
  }, []);

  useEffect(() => {
    if (!name) return;
    fetch(`/api/pos_trans_configs?name=${encodeURIComponent(name)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        const tbl = transactions.find((t) => t.name === name)?.table || '';
        if (cfg) setConfig({ table: tbl, ...cfg });
        else setConfig((c) => ({ ...c, table: tbl }));
      })
      .catch(() => {
        const tbl = transactions.find((t) => t.name === name)?.table || '';
        setConfig((c) => ({ ...c, table: tbl }));
      });
  }, [name, transactions]);

  function updateCalc(idx, key, val) {
    setConfig((c) => {
      const arr = [...c.calcFields];
      arr[idx] = { ...arr[idx], [key]: val };
      return { ...c, calcFields: arr };
    });
  }

  function handleSave() {
    fetch('/api/pos_trans_configs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config }),
    })
      .then((res) => {
        if (res.ok) addToast('Saved', 'success');
        else addToast('Save failed', 'error');
      })
      .catch(() => addToast('Save failed', 'error'));
  }

  function handleDelete() {
    if (!name || !confirm('Delete configuration?')) return;
    fetch(`/api/pos_trans_configs?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          setConfig({
            table: '',
            multi: false,
            position: 'hidden',
            calcFields: [],
            posCalc: {},
            statusBefore: '',
            statusAfter: '',
          });
          addToast('Deleted', 'success');
        } else addToast('Delete failed', 'error');
      })
      .catch(() => addToast('Delete failed', 'error'));
  }

  const posFields = ['cashback', 'payable_amount'];

  return (
    <div>
      <h2>POS Transaction Config</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select value={name} onChange={(e) => setName(e.target.value)}>
          <option value="">-- select transaction --</option>
          {transactions.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        {name && (
          <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
            Delete
          </button>
        )}
      </div>
      {name && (
        <div>
          <div>Table: {config.table}</div>
          <label>
            <input
              type="checkbox"
              checked={config.multi}
              onChange={(e) => setConfig((c) => ({ ...c, multi: e.target.checked }))}
            />
            Multiple rows
          </label>
          <div>
            Position:
            <select
              value={config.position}
              onChange={(e) => setConfig((c) => ({ ...c, position: e.target.value }))}
            >
              <option value="upper_left">Upper Left</option>
              <option value="upper_right">Upper Right</option>
              <option value="lower_left">Lower Left</option>
              <option value="lower_right">Lower Right</option>
              <option value="bottom">Bottom Row</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h3>Calculated Fields</h3>
            {config.calcFields.map((f, idx) => (
              <div key={idx}>
                <input
                  placeholder="target"
                  value={f.target || ''}
                  onChange={(e) => updateCalc(idx, 'target', e.target.value)}
                />
                <input
                  placeholder="expression"
                  value={f.expression || ''}
                  onChange={(e) => updateCalc(idx, 'expression', e.target.value)}
                />
                <button
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      calcFields: c.calcFields.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  calcFields: [...c.calcFields, { target: '', expression: '' }],
                }))
              }
            >
              Add Field
            </button>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h3>POS Fields</h3>
            {posFields.map((p) => (
              <div key={p}>
                <label>
                  {p}:{' '}
                  <input
                    value={config.posCalc[p] || ''}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posCalc: { ...c.posCalc, [p]: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label>
              Status before posting:{' '}
              <input
                value={config.statusBefore}
                onChange={(e) => setConfig((c) => ({ ...c, statusBefore: e.target.value }))}
              />
            </label>
          </div>
          <div>
            <label>
              Status after posting:{' '}
              <input
                value={config.statusAfter}
                onChange={(e) => setConfig((c) => ({ ...c, statusAfter: e.target.value }))}
              />
            </label>
          </div>
          <button onClick={handleSave} style={{ marginTop: '1rem' }}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
