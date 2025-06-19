import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';

export default function FinanceTransactions({ defaultName = '', hideSelector = false }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [config, setConfig] = useState(null);
  const [refreshId, setRefreshId] = useState(0);

  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    if (defaultName) return;
    if (name) setSearchParams({ name });
    else setSearchParams({});
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
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null));
  }, [table, name]);

  const transactionNames = Object.keys(configs);

  return (
    <div>
      <h2>{defaultName || 'Finance Transactions'}</h2>
      {!hideSelector && transactionNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select value={name} onChange={(e) => { setName(e.target.value); setRefreshId((r) => r + 1); }}>
            <option value="">-- select transaction --</option>
            {transactionNames.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}
      {table && config && (
        <TableManager
          table={table}
          refreshId={refreshId}
          formConfig={config}
          initialPerPage={10}
          addLabel="Add Transaction"
        />
      )}
      {transactionNames.length === 0 && (
        <p>No transactions configured.</p>
      )}
    </div>
  );
}
