import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import TransactionsTable from '../components/TransactionsTable.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnSession } from '../context/TxnSessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', moduleLabel = '' }) {
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = `name_${moduleKey}`;
  const [sessionState, setSessionState] = useTxnSession(moduleKey);
  const [name, setName] = useState(() => sessionState.name || searchParams.get(paramKey) || '');
  const [table, setTable] = useState(() => sessionState.table || '');
  const [config, setConfig] = useState(() => sessionState.config || null);
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const prevModuleKey = useRef(moduleKey);
  const { addToast } = useToast();
  const [dateFilter, setDateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  
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
  }, [moduleKey]);

  // persist state to session
  useEffect(() => {
    setSessionState({ name, table, config });
  }, [name, table, config, setSessionState]);

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
      .then((res) => {
        if (!res.ok) {
          addToast('Failed to load transaction forms', 'error');
          return {};
        }
        return res.json().catch(() => {
          addToast('Failed to parse transaction forms', 'error');
          return {};
        });
      })
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
      .catch(() => {
        addToast('Failed to load transaction forms', 'error');
        setConfigs({});
      });
  }, [moduleKey, company, perms, licensed]);

  useEffect(() => {
    if (!name) {
      setTable('');
      setConfig(null);
      setShowTable(false);
      return;
    }
    if (configs[name]) {
      const tbl = configs[name].table ?? configs[name];
      if (tbl !== table) {
        setTable(tbl);
        setConfig(null);
        setShowTable(false);
      }
    }
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
    if (!table || !name) {
      setConfig(null);
      return;
    }
    let canceled = false;
    fetch(
      `/api/transaction_forms?table=${encodeURIComponent(
        table,
      )}&name=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    )
      .then((res) => {
        if (canceled) return null;
        if (!res.ok) {
          addToast('Failed to load transaction configuration', 'error');
          return null;
        }
        return res.json().catch(() => null);
      })
      .then((cfg) => {
        if (canceled) return;
        if (cfg && cfg.moduleKey) {
          setConfig(cfg);
        } else {
          setConfig(null);
          setShowTable(false);
          addToast('Transaction configuration not found', 'error');
        }
      })
      .catch(() => {
        if (!canceled) {
          setConfig(null);
          setShowTable(false);
          addToast('Failed to load transaction configuration', 'error');
        }
      });
    return () => {
      canceled = true;
    };
  }, [table, name, addToast]);

  const transactionNames = Object.keys(configs);

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
                const newName = e.target.value;
                setName(newName);
                setRefreshId((r) => r + 1);
                setShowTable(false);
                if (!newName) {
                  setTable('');
                  setConfig(null);
                } else if (configs[newName]) {
                  const tbl = configs[newName].table ?? configs[newName];
                  if (tbl !== table) {
                    setTable(tbl);
                    setConfig(null);
                  }
                }
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
          <label style={{ marginRight: '0.5rem' }}>
            Date:
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ marginLeft: '0.25rem' }}
            />
          </label>
          <label style={{ marginRight: '0.5rem' }}>
            Type:
            <input
              type="text"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ marginLeft: '0.25rem' }}
            />
          </label>
        </div>
      )}
      {table && config && (
        <TransactionsTable
          branchId={company?.branch_id}
          type={typeFilter}
          date={dateFilter}
          perPage={10}
        />
      )}
      {transactionNames.length === 0 && (
        <p>No transactions configured.</p>
      )}
    </div>
  );
}
