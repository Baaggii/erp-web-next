import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', moduleLabel = '' }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = `name_${moduleKey}`;
  const [name, setName] = useState(() => searchParams.get(paramKey) || '');
  const [table, setTable] = useState('');
  const [config, setConfig] = useState(null);
  const [refreshId, setRefreshId] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const tableRef = useRef(null);
  const prevModuleKey = useRef(moduleKey);


  useEffect(() => {
    if (prevModuleKey.current !== moduleKey) {
      setName('');
      setTable('');
      setConfig(null);
      setShowTable(false);
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete(`name_${prevModuleKey.current}`);
        return sp;
      });
    }
    prevModuleKey.current = moduleKey;
  }, [moduleKey, setSearchParams]);

  useEffect(() => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (name) sp.set(paramKey, name);
      else sp.delete(paramKey);
      return sp;
    });
  }, [name, setSearchParams, paramKey]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (moduleKey) params.set('moduleKey', moduleKey);
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
          const mKey = info.moduleKey;
          if (mKey !== moduleKey) return;
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
    if (Object.keys(configs).length === 0) {
      setName('');
      setTable('');
      setConfig(null);
      setShowTable(false);
    }
  }, [configs]);

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

  const caption = 'Choose transaction';

  return (
    <div>
      <h2>{moduleLabel || 'Transactions'}</h2>
      {transactionNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem', maxWidth: '300px' }}>
          <SearchSelect
            value={name}
            onChange={(v) => {
              setName(v);
              setRefreshId((r) => r + 1);
              setShowTable(false);
            }}
            options={[
              { value: '', label: caption },
              ...transactionNames.map((t) => ({ value: t, label: t })),
            ]}
            placeholder={caption}
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
        <TableManager
          ref={tableRef}
          table={table}
          refreshId={refreshId}
          formConfig={config}
          initialPerPage={10}
          addLabel="Add Transaction"
          showTable={showTable}
        />
      )}
      {transactionNames.length === 0 && (
        <p>No transactions configured.</p>
      )}
    </div>
  );
}
