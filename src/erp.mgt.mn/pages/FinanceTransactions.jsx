import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnSession } from '../context/TxnSessionContext.jsx';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', moduleLabel = '' }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = `name_${moduleKey}`;
  const [sessionState, setSessionState] = useTxnSession(moduleKey);
  const [name, setName] = useState(() => sessionState.name || searchParams.get(paramKey) || '');
  const [table, setTable] = useState(() => sessionState.table || '');
  const [config, setConfig] = useState(() => sessionState.config || null);
  const [refreshId, setRefreshId] = useState(() => sessionState.refreshId || 0);
  const [showTable, setShowTable] = useState(() => sessionState.showTable || false);
  const [dateFilter, setDateFilter] = useState(() => sessionState.dateFilter || '');
  const [typeFilter, setTypeFilter] = useState(() => sessionState.typeFilter || '');
  const [transTypes, setTransTypes] = useState([]);
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const tableRef = useRef(null);
  const prevModuleKey = useRef(moduleKey);

  
  useEffect(() => {
    if (prevModuleKey.current !== moduleKey) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete(`name_${prevModuleKey.current}`);
        return sp;
      });
    }
    prevModuleKey.current = moduleKey;
  }, [moduleKey, setSearchParams]);

  // load stored session for this module
  useEffect(() => {
    setName(sessionState.name || '');
    setTable(sessionState.table || '');
    setConfig(sessionState.config || null);
    setRefreshId(sessionState.refreshId || 0);
    setShowTable(sessionState.showTable || false);
  }, [moduleKey]);

  // persist state to session
  useEffect(() => {
    setSessionState({ name, table, config, refreshId, showTable, dateFilter, typeFilter });
  }, [name, table, config, refreshId, showTable, dateFilter, typeFilter, setSessionState]);

  useEffect(() => {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (name) sp.set(paramKey, name);
      else sp.delete(paramKey);
      return sp;
    });
  }, [name, setSearchParams, paramKey]);

  useEffect(() => {
    fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setTransTypes(data.rows || []))
      .catch(() => setTransTypes([]));
  }, []);

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
    fetch(
      `/api/transaction_forms?table=${encodeURIComponent(
        table,
      )}&name=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && cfg.moduleKey) {
          setConfig(cfg);
        } else {
          setConfig(null);
          setShowTable(false);
        }
      })
      .catch(() => setConfig(null));
  }, [table, name]);

  useEffect(() => {
    if (!config) {
      setDateFilter('');
      setTypeFilter('');
      return;
    }
    if (config.dateColumn) {
      setDateFilter(new Date().toISOString().slice(0, 10));
    } else {
      setDateFilter('');
    }
    if (config.transTypeField) {
      setTypeFilter(config.transTypeValue || '');
    } else {
      setTypeFilter('');
    }
  }, [config]);

  const transactionNames = Object.keys(configs);

  const initialFilters = React.useMemo(() => {
    const map = {};
    if (config) {
      if (config.dateColumn && dateFilter) map[config.dateColumn] = dateFilter;
      if (config.transTypeField && typeFilter) map[config.transTypeField] = typeFilter;
    }
    return map;
  }, [config, dateFilter, typeFilter]);

  if (!perms || !licensed) return <p>Loading...</p>;
  if (!perms[moduleKey] || !licensed[moduleKey]) return <p>Access denied.</p>;

  const caption = 'Choose transaction';

  return (
    <div>
      <h2>{moduleLabel || 'Transactions'}</h2>
        {transactionNames.length > 0 && (
          <div style={{ marginBottom: '0.5rem', maxWidth: '300px' }}>
            <select
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setRefreshId((r) => r + 1);
                setShowTable(false);
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
            >
              <option value="">{caption}</option>
              {transactionNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
          {config.dateColumn && (
            <span style={{ marginLeft: '1rem' }}>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              <button onClick={() => setDateFilter('')} style={{ marginLeft: '0.25rem' }}>
                Clear
              </button>
            </span>
          )}
          {config.transTypeField && (
            <span style={{ marginLeft: '1rem' }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value=""></option>
                {transTypes.map((t) => (
                  <option key={t.UITransType} value={t.UITransType}>
                    {t.UITransTypeName}
                  </option>
                ))}
              </select>
              <button onClick={() => setTypeFilter('')} style={{ marginLeft: '0.25rem' }}>
                Clear
              </button>
            </span>
          )}
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
          initialFilters={initialFilters}
        />
      )}
      {transactionNames.length === 0 && (
        <p>No transactions configured.</p>
      )}
    </div>
  );
}
