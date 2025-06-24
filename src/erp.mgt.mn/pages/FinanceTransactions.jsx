import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', defaultName = '', hideSelector = false }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState(() => defaultName || searchParams.get('name') || '');
  const [table, setTable] = useState('');
  const [config, setConfig] = useState(null);
  const [refreshId, setRefreshId] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
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
    if (company?.department_id !== undefined)
      params.set('departmentId', company.department_id);
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const filtered = {};
        Object.entries(data).forEach(([n, info]) => {
          const allowedB = info.allowedBranches || [];
          const allowedD = info.allowedDepartments || [];
          const mKey = info.moduleKey || 'finance_transactions';
          if (
            allowedB.length > 0 &&
            company?.branch_id !== undefined &&
            !allowedB.includes(company.branch_id)
          )
            return;
          if (
            allowedD.length > 0 &&
            company?.department_id !== undefined &&
            !allowedD.includes(company.department_id)
          )
            return;
          if (perms && !perms[mKey]) return;
          if (licensed && !licensed[mKey]) return;
          filtered[n] = info;
        });
        setConfigs(filtered);
        if (name && filtered[name]) setTable(filtered[name].table ?? filtered[name]);
      })
      .catch(() => setConfigs({}));
  }, [moduleKey, company, perms, licensed]);

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

  if (!perms || !licensed) return <p>Loading...</p>;
  if (!perms[moduleKey] || !licensed[moduleKey]) return <p>Access denied.</p>;

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
              setShowTable(false);
            }}
            options={[
              { value: '', label: 'Choose transaction' },
              ...transactionNames.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="Choose transaction"
          />
        </div>
      )}
      {table && config && (
        <div style={{ marginBottom: '0.5rem' }}>
          <button onClick={() => tableRef.current?.openAdd()} style={{ marginRight: '0.5rem' }}>
            Add Transaction
          </button>
          <button onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Hide Table' : 'View Table'}
          </button>
        </div>
      )}
      {table && config && (
        <div style={{ display: showTable ? 'block' : 'none' }}>
          <TableManager
            ref={tableRef}
            table={table}
            refreshId={refreshId}
            formConfig={config}
            initialPerPage={10}
            addLabel="Add Transaction"
          />
        </div>
      )}
      {transactionNames.length === 0 && (
        <p>No transactions configured.</p>
      )}
    </div>
  );
}
