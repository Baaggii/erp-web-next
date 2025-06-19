import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

export default function FinanceTransactions({ defaultName = '', hideSelector = false }) {
  const { user, company } = useContext(AuthContext);
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    if (defaultName) return; // keep URL clean when using fixed name
    if (name) {
      setSearchParams({ name });
    } else {
      setSearchParams({});
    }
  }, [name, setSearchParams, defaultName]);

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setConfigs(data);
        if (name && data[name]) setTable(data[name].table ?? data[name]);
      })
      .catch(() => setConfigs({}));
  }, []);

  useEffect(() => {
    if (name && configs[name]) setTable(configs[name].table ?? configs[name]);
  }, [name, configs]);

  useEffect(() => {
    if (!table || !name) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null));
  }, [table, name]);

  useEffect(() => {
    if (table && name) loadRows();
  }, [table, name]);

  async function loadRows() {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}`, { credentials: 'include' });
    const data = res.ok ? await res.json() : {};
    setRows(data.rows || []);
  }

  // no row editing or modal forms

  async function handleDelete(id) {
    if (!window.confirm('Delete transaction?')) return;
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setMessage('Transaction deleted');
      loadRows();
    } else {
      setMessage('Delete failed');
    }
  }

  const fields = config?.visibleFields?.length ? config.visibleFields : columns;
  const transactionNames = Object.keys(configs);

  if (transactionNames.length === 0) {
    return (
      <div>
        <h2>{defaultName || 'Finance Transactions'}</h2>
        <p>No transactions configured.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{defaultName || 'Finance Transactions'}</h2>
      {message && (
        <div style={{ marginBottom: '0.5rem', color: '#065f46' }}>{message}</div>
      )}
      {!hideSelector && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">-- select transaction --</option>
            {transactionNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {/* add functionality removed */}
        </div>
      )}
      {hideSelector && name && (
        <div style={{ marginBottom: '0.5rem' }}>
          {/* add functionality removed */}
        </div>
      )}
      {name && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f} style={{ border: '1px solid #ccc', padding: '4px' }}>
                  {f}
                </th>
              ))}
              <th style={{ border: '1px solid #ccc', padding: '4px' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f} style={{ border: '1px solid #ccc', padding: '4px' }}>
                    {String(r[f] ?? '')}
                  </td>
                ))}
                <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                  <button onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 1} style={{ textAlign: 'center', padding: '4px' }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
