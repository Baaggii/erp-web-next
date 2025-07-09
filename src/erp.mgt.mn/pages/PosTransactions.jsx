import React, { useEffect, useState } from 'react';
import RowFormModal from '../components/RowFormModal.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const [values, setValues] = useState({});

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));
  }, []);

  useEffect(() => {
    if (!name) { setConfig(null); return; }
    fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => { setConfig(cfg); setFormConfigs({}); setValues({}); })
      .catch(() => { setConfig(null); });
  }, [name]);

  useEffect(() => {
    if (!config) return;
    const tables = [config.masterTable, ...config.tables.map(t => t.table)];
    const forms = [config.masterForm, ...config.tables.map(t => t.form)];
    tables.forEach((tbl, idx) => {
      const form = forms[idx];
      if (!tbl || !form) return;
      fetch(`/api/transaction_forms?table=${encodeURIComponent(tbl)}&name=${encodeURIComponent(form)}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(cfg => setFormConfigs(f => ({ ...f, [tbl]: cfg || {} })))
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {[{ table: config.masterTable, type: config.masterType }, ...config.tables].map((t, idx) => {
            const fc = formConfigs[t.table];
            if (!fc) return <div key={idx}>Loading...</div>;
            const visible = fc.visibleFields || [];
            return (
              <div key={idx} style={{ border: '1px solid #ccc' }}>
                <h3 style={{ margin: '0.5rem' }}>{t.table}</h3>
                <RowFormModal
                  inline
                  visible
                  columns={visible}
                  requiredFields={fc.requiredFields || []}
                  onChange={changes => handleChange(t.table, changes)}
                  onSubmit={row => handleSubmit(t.table, row)}
                  useGrid={t.type === 'multi'}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
