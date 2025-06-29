import isEqual from 'lodash.isequal';
import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnSession } from '../context/TxnSessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function FinanceTransactions({ moduleKey = 'finance_transactions', moduleLabel = '' }) {
  const renderCount = useRef(0);
  renderCount.current++;
  if (renderCount.current > 10) {
    console.warn('⚠️ Excessive renders: FinanceTransactions', renderCount.current);
  }
  const [configs, setConfigs] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const paramKey = useMemo(() => `name_${moduleKey}`, [moduleKey]);
  const [sessionState, setSessionState] = useTxnSession(moduleKey);
  const [name, setName] = useState(() => sessionState.name || searchParams.get(paramKey) || '');
  const [table, setTable] = useState(() => sessionState.table || '');
  const [config, setConfig] = useState(() => sessionState.config || null);
  const [refreshId, setRefreshId] = useState(() => sessionState.refreshId || 0);
  const [showTable, setShowTable] = useState(() => sessionState.showTable || false);
  const { company } = useContext(AuthContext);
  const perms = useRolePermissions();
  const licensed = useCompanyModules(company?.company_id);
  const tableRef = useRef(null);
  const prevModuleKey = useRef(moduleKey);
  const { addToast } = useToast();
  const renderCount = useRef(0);
  const mounted = useRef(false);
  const sessionLoaded = useRef(false);
  const prevSessionRef = useRef({});
  const prevConfigRef = useRef(null);


  useEffect(() => {
    console.log('FinanceTransactions render monitor effect');
    if (process.env.NODE_ENV !== 'production') {
      renderCount.current++;
      if (renderCount.current > 5) console.warn('Excessive re-renders');
    }
  }, []);

  useEffect(() => {
    if (mounted.current) return;
    console.log('FinanceTransactions mount effect');
    mounted.current = true;
  }, []);

  
  useEffect(() => {
    console.log('FinanceTransactions moduleKey effect');
    if (prevModuleKey.current !== moduleKey) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete(`name_${prevModuleKey.current}`);
        return sp;
      });
    }
    prevModuleKey.current = moduleKey;
  }, [moduleKey]);

  // load stored session for this module
  // load stored session for this module
useEffect(() => {
  if (sessionLoaded.current) return;
  console.log('FinanceTransactions load session effect');

  const next = {
    name: sessionState.name || '',
    table: sessionState.table || '',
    config: sessionState.config || null,
    refreshId: sessionState.refreshId || 0,
    showTable: sessionState.showTable || false,
  };

  if (!isEqual(prevSessionRef.current, next)) {
    setName(next.name);
    setTable(next.table);
    setConfig(next.config);
    setRefreshId(next.refreshId);
    setShowTable(next.showTable);
    prevSessionRef.current = next;
  }

  sessionLoaded.current = true;
}, [moduleKey]);


  // persist state to session
  useEffect(() => {
    console.log('FinanceTransactions persist session effect');
    setSessionState({ name, table, config, refreshId, showTable });
  }, [name, table, config, refreshId, showTable]);

  useEffect(() => {
    console.log('FinanceTransactions search param effect');
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (name) sp.set(paramKey, name);
      else sp.delete(paramKey);
      return sp;
    });
  }, [name, paramKey]);

  useEffect(() => {
    console.log('FinanceTransactions load forms effect');
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
        if (name && filtered[name]) {
          const tbl = filtered[name].table ?? filtered[name];
          if (tbl !== table) setTable(tbl);
        }
      })
      .catch(() => {
        addToast('Failed to load transaction forms', 'error');
        setConfigs({});
      });
  }, [moduleKey, company, perms, licensed]);

  useEffect(() => {
    console.log('FinanceTransactions table sync effect');
    if (!name) {
      if (table !== '') setTable('');
      if (config !== null) setConfig(null);
      if (showTable) setShowTable(false);
      return;
    }
    if (configs[name]) {
      const tbl = configs[name].table ?? configs[name];
      if (tbl !== table) {
        setTable(tbl);
        if (config !== null) setConfig(null);
        if (showTable) setShowTable(false);
      }
    }
  }, [name, configs]);

  useEffect(() => {
    console.log('FinanceTransactions configs empty effect');
    if (Object.keys(configs).length === 0) {
      setName('');
      if (table !== '') setTable('');
      if (config !== null) setConfig(null);
      if (showTable) setShowTable(false);
    }
  }, [configs]);

  useEffect(() => {
  console.log('FinanceTransactions fetch config effect');
  if (!table || !name) {
    if (config !== null) setConfig(null);
    return;
  }
  let canceled = false;
  fetch(
    `/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`,
    { credentials: 'include' }
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
        if (!isEqual(cfg, prevConfigRef.current)) {
          setConfig(cfg);
          prevConfigRef.current = cfg;
        }
      } else {
        if (config !== null) setConfig(null);
        if (showTable) setShowTable(false);
        addToast('Transaction configuration not found', 'error');
      }
    })
    .catch(() => {
      if (!canceled) {
        if (config !== null) setConfig(null);
        if (showTable) setShowTable(false);
        addToast('Failed to load transaction configuration', 'error');
      }
    });
  return () => {
    canceled = true;
  };
}, [table, name, addToast]);


  const transactionNames = useMemo(() => Object.keys(configs), [configs]);

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
                if (newName === name) return;
                setName(newName);
                setRefreshId((r) => r + 1);
                setShowTable(false);
                if (!newName) {
                  if (table !== '') setTable('');
                  if (config !== null) setConfig(null);
                } else if (configs[newName]) {
                  const tbl = configs[newName].table ?? configs[newName];
                  if (tbl !== table) {
                    setTable(tbl);
                    if (config !== null) setConfig(null);
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
          key={`${moduleKey}-${name}`}
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
