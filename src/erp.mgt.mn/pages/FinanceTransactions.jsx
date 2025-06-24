import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', defaultName = '', hideSelector = false }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [config, setConfig] = useState(null);
  const [refreshId, setRefreshId] = useState(0);
  const { company } = useContext(AuthContext);
  const tableRef = useRef(null);

  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    if (defaultName) return;
    if (name) setSearchParams({ name });
    else setSearchParams({});
  }, [name, setSearchParams, defaultName]);

  useEffect(() => {
    const params = new URLSearchParams({ moduleKey });
    if (company?.branch_id !== undefined)
      params.set('branchId', company.branch_id);
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setConfigs(data);
        if (name && data[name]) setTable(data[name].table ?? data[name]);
      })
      .catch(() => setConfigs({}));
  }, [moduleKey, company]);

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
        <div style={{ marginBottom: '0.5rem', maxWidth: '300px' }}>
          <SearchSelect
            value={name}
            onChange={(v) => {
              setName(v);
              setRefreshId((r) => r + 1);
            }}
            options={transactionNames.map((t) => ({ value: t, label: t }))}
          />
        </div>
      )}
      {table && config && (
        <div style={{ marginBottom: '0.5rem' }}>
          <button onClick={() => tableRef.current?.openAdd()}>Add Transaction</button>
        </div>
      )}
      {table && config && (
        <TableManager
          ref={tableRef}
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
