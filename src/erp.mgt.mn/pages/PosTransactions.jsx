import React, { useEffect, useState, useRef } from 'react';
import RowFormModal from '../components/RowFormModal.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const [values, setValues] = useState({});
  const [layout, setLayout] = useState({});
  const [labels, setLabels] = useState({});
  const refs = useRef({});

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));
  }, []);

  useEffect(() => {
    if (!name) { setConfig(null); setLayout({}); return; }
    fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.tables) && cfg.tables.length > 0 && !cfg.masterTable) {
          const [master, ...rest] = cfg.tables;
          cfg = {
            ...cfg,
            masterTable: master.table || '',
            masterForm: master.form || '',
            masterType: master.type || 'single',
            masterPosition: master.position || 'upper_left',
            masterView: master.view || 'cells',
            tables: rest,
          };
        }
        setConfig(cfg);
        setFormConfigs({});
        setValues({});
      })
      .catch(() => { setConfig(null); });
    fetch(`/api/pos_txn_layout?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .then(data => setLayout(data || {}))
      .catch(() => setLayout({}));
  }, [name]);

  useEffect(() => {
    if (!config) return;
    const tables = [config.masterTable, ...config.tables.map(t => t.table)];
    const forms = [config.masterForm || '', ...config.tables.map(t => t.form)];
    tables.forEach((tbl, idx) => {
      const form = forms[idx];
      if (!tbl || !form) return;
      fetch(`/api/transaction_forms?table=${encodeURIComponent(tbl)}&name=${encodeURIComponent(form)}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(cfg => setFormConfigs(f => ({ ...f, [tbl]: cfg || {} })))
        .catch(() => {});
      fetch(`/api/tables/${encodeURIComponent(tbl)}/columns`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(cols => {
          const map = {};
          cols.forEach(c => { map[c.name || c.COLUMN_NAME || c] = c.label || c.name || c; });
          setLabels(l => ({ ...l, [tbl]: map }));
        })
        .catch(() => {});
    });
  }, [config]);

  function handleChange(tbl, changes) {
    setValues(v => ({ ...v, [tbl]: { ...v[tbl], ...changes } }));
  }

  async function handleSubmit(tbl, row) {
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(tbl)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(row),
      });
      if (res.ok) addToast('Saved', 'success');
      else addToast('Save failed', 'error');
    } catch {
      addToast('Save failed', 'error');
    }
  }

  async function handleSaveLayout() {
    if (!name) return;
    const info = {};
    const list = [
      { table: config.masterTable },
      ...config.tables,
    ];
    list.forEach((t) => {
      const el = refs.current[t.table];
      if (el) {
        info[t.table] = {
          width: el.offsetWidth,
          height: el.offsetHeight,
        };
      }
    });
    await fetch('/api/pos_txn_layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, layout: info }),
    });
    addToast('Layout saved', 'success');
  }

  const configNames = Object.keys(configs);

  return (
    <div>
      <h2>POS Transactions</h2>
      {configNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select value={name} onChange={e => setName(e.target.value)}>
            <option value="">-- select config --</option>
            {configNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {config && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleSaveLayout}>Save Layout</button>
          </div>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: '1fr 1fr 1fr',
              gridTemplateRows: 'auto auto auto auto auto',
            }}
          >
            {[
              {
                table: config.masterTable,
                type: config.masterType,
                position: config.masterPosition,
                view: config.masterView,
              },
              ...config.tables,
            ]
              .filter((t) => t.position !== 'hidden')
              .map((t, idx) => {
                const fc = formConfigs[t.table];
                if (!fc) return <div key={idx}>Loading...</div>;
                const visible = Array.isArray(fc.visibleFields) ? fc.visibleFields : [];
                const posStyle = {
                  top_row: { gridColumn: '1 / span 3', gridRow: '1' },
                  upper_left: { gridColumn: '1', gridRow: '2' },
                  upper_right: { gridColumn: '3', gridRow: '2' },
                  left: { gridColumn: '1', gridRow: '3' },
                  right: { gridColumn: '3', gridRow: '3' },
                  lower_left: { gridColumn: '1', gridRow: '4' },
                  lower_right: { gridColumn: '3', gridRow: '4' },
                  bottom_row: { gridColumn: '1 / span 3', gridRow: '5' },
                }[t.position] || { gridColumn: '2', gridRow: '3' };
                const saved = layout[t.table] || {};
                return (
                  <div
                    key={idx}
                    ref={(el) => (refs.current[t.table] = el)}
                    style={{
                      border: '1px solid #ccc',
                      resize: 'both',
                      overflow: 'auto',
                      width: saved.width || 'auto',
                      height: saved.height || 'auto',
                      ...posStyle,
                    }}
                  >
                    <h3 style={{ margin: '0.5rem' }}>{t.table}</h3>
                    <RowFormModal
                      inline
                      visible
                      columns={visible}
                      labels={labels[t.table] || {}}
                      requiredFields={fc.requiredFields || []}
                      onChange={(changes) => handleChange(t.table, changes)}
                      onSubmit={(row) => handleSubmit(t.table, row)}
                      useGrid={t.type === 'multi'}
                      hideAddButton
                      formView={t.view || 'cells'}
                    />
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
