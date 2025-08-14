import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import TableManager from '../components/TableManager.jsx';
import ReportTable from '../components/ReportTable.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import { useTxnSession } from '../context/TxnSessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';

function isEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

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
  const [showTable, setShowTable] = useState(() =>
    sessionState.showTable || !!sessionState.config,
  );
  const [selectedProc, setSelectedProc] = useState(() => sessionState.selectedProc || '');
  const [startDate, setStartDate] = useState(() => sessionState.startDate || '');
  const [endDate, setEndDate] = useState(() => sessionState.endDate || '');
  const [datePreset, setDatePreset] = useState(
    () => sessionState.datePreset || 'custom',
  );
  const [procParams, setProcParams] = useState([]);
  const [reportResult, setReportResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const { company, user, permissions: perms } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const licensed = useCompanyModules(company?.company_id);
  const tableRef = useRef(null);
  const prevModuleKey = useRef(moduleKey);
  const { addToast } = useToast();
  const mounted = useRef(false);
  const sessionLoaded = useRef(false);
  const prevSessionRef = useRef({});
  const prevConfigRef = useRef(null);

  const procMap = useHeaderMappings(
    config?.procedures
      ? [...config.procedures, selectedProc].filter(Boolean)
      : selectedProc
      ? [selectedProc]
      : [],
  );

  function getProcLabel(name) {
    return (
      generalConfig.general?.procLabels?.[name] || procMap[name] || name
    );
  }


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
    showTable: sessionState.showTable || !!sessionState.config,
    selectedProc: sessionState.selectedProc || '',
    startDate: sessionState.startDate || '',
    endDate: sessionState.endDate || '',
    datePreset: sessionState.datePreset || 'custom',
  };

  if (!isEqual(prevSessionRef.current, next)) {
    setName(next.name);
    setTable(next.table);
    setConfig(next.config);
    setRefreshId(next.refreshId);
    setShowTable(next.showTable);
    setSelectedProc(next.selectedProc);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setDatePreset(next.datePreset);
    prevSessionRef.current = next;
  }

  sessionLoaded.current = true;
}, [moduleKey]);


  // persist state to session
  useEffect(() => {
    console.log('FinanceTransactions persist session effect');
    setSessionState({
      name,
      table,
      config,
      refreshId,
      showTable,
      selectedProc,
      startDate,
      endDate,
      datePreset,
    });
  }, [name, table, config, refreshId, showTable, selectedProc, startDate, endDate, datePreset]);

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
        const prefix = generalConfig?.general?.reportProcPrefix || '';
        let nextCfg = cfg;
        if (prefix && Array.isArray(cfg.procedures)) {
          nextCfg = {
            ...cfg,
            procedures: cfg.procedures.filter((p) =>
              p.toLowerCase().includes(prefix.toLowerCase()),
            ),
          };
        }
        if (!isEqual(nextCfg, prevConfigRef.current)) {
          setConfig(nextCfg);
          prevConfigRef.current = nextCfg;
        }
        setShowTable(true);
      } else {
        if (config !== null) setConfig(null);
        setShowTable(false);
        addToast('Transaction configuration not found', 'error');
      }
    })
    .catch(() => {
      if (!canceled) {
        if (config !== null) setConfig(null);
        setShowTable(false);
        addToast('Failed to load transaction configuration', 'error');
      }
    });
  return () => {
    canceled = true;
  };
}, [table, name, addToast, generalConfig?.general?.reportProcPrefix]);

  useEffect(() => {
    if (!selectedProc) {
      setProcParams([]);
      setManualParams({});
      return;
    }
    fetch(`/api/procedures/${encodeURIComponent(selectedProc)}/params`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { parameters: [] }))
      .then((data) => setProcParams(data.parameters || []))
      .catch(() => setProcParams([]));
  }, [selectedProc]);

  useEffect(() => {
    setSelectedProc('');
    setStartDate('');
    setEndDate('');
    setDatePreset('custom');
    setManualParams({});
  }, [name]);

  useEffect(() => {
    setReportResult(null);
    setManualParams({});
  }, [selectedProc, name]);


  const transactionNames = useMemo(() => Object.keys(configs), [configs]);
  const autoParams = useMemo(() => {
    return procParams.map((p) => {
      const name = p.toLowerCase();
      if (name.includes('start') || name.includes('from')) return startDate || null;
      if (name.includes('end') || name.includes('to')) return endDate || null;
      if (name.includes('branch')) return company?.branch_id ?? null;
      if (name.includes('company')) return company?.company_id ?? null;
      if (name.includes('user') || name.includes('emp')) return user?.empid ?? null;
      return null;
    });
  }, [procParams, startDate, endDate, company, user]);

  const finalParams = useMemo(() => {
    return procParams.map((p, i) => {
      const auto = autoParams[i];
      return auto ?? manualParams[p] ?? null;
    });
  }, [procParams, autoParams, manualParams]);

  const allParamsProvided = useMemo(
    () => finalParams.every((v) => v !== null && v !== ''),
    [finalParams],
  );

  function handlePresetChange(e) {
    const value = e.target.value;
    setDatePreset(value);
    if (value === 'custom') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start = '', end = '';
    switch (value) {
      case 'month':
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 1);
        break;
      case 'q1':
        start = new Date(y, 0, 1);
        end = new Date(y, 3, 1);
        break;
      case 'q2':
        start = new Date(y, 3, 1);
        end = new Date(y, 6, 1);
        break;
      case 'q3':
        start = new Date(y, 6, 1);
        end = new Date(y, 9, 1);
        break;
      case 'q4':
        start = new Date(y, 9, 1);
        end = new Date(y + 1, 0, 1);
        break;
      case 'quarter': {
        const q = Math.floor(m / 3);
        start = new Date(y, q * 3, 1);
        end = new Date(y, q * 3 + 3, 1);
        break;
      }
      case 'year':
        start = new Date(y, 0, 1);
        end = new Date(y + 1, 0, 1);
        break;
      default:
        return;
    }
    const fmt = (d) =>
      d instanceof Date ? formatTimestamp(d).slice(0, 10) : '';
    setStartDate(fmt(start));
    setEndDate(fmt(end));
  }

  async function runReport() {
    if (!selectedProc) return;
    if (!allParamsProvided) {
      addToast('Missing parameters', 'error');
      return;
    }
    const paramMap = procParams.reduce((acc, p, i) => {
      acc[p] = finalParams[i];
      return acc;
    }, {});
    const label = getProcLabel(selectedProc);
    addToast(`Calling ${label}`, 'info');
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: selectedProc, params: finalParams }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ row: [] }));
        const rows = Array.isArray(data.row) ? data.row : [];
        addToast(
          `${label} returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
          'success',
        );
        setReportResult({ name: selectedProc, params: paramMap, rows });
      } else {
        addToast('Failed to run procedure', 'error');
      }
    } catch {
      addToast('Failed to run procedure', 'error');
    }
  }

  if (!perms || !licensed) return <p>Ачааллаж байна...</p>;
  if (!perms[moduleKey] || !licensed[moduleKey]) return <p>Нэвтрэх эрхгүй.</p>;

  const caption = 'Гүйлгээ сонгоно уу';

  return (
    <div>
      <h2>{moduleLabel || 'Гүйлгээ'}</h2>
        {transactionNames.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ maxWidth: '300px' }}>
              <select
                value={name}
                onChange={(e) => {
                  const newName = e.target.value;
                  if (newName === name) return;
                  setName(newName);
                  setRefreshId((r) => r + 1);
                  setShowTable(true);
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
            {config?.procedures?.length > 0 && (
              <div style={{ marginLeft: '1rem' }}>
                <span style={{ marginRight: '0.5rem' }}>REPORTS</span>
                <select
                  value={selectedProc}
                  onChange={(e) => setSelectedProc(e.target.value)}
                >
                  <option value="">-- select --</option>
                  {config.procedures.map((p) => (
                    <option key={p} value={p}>
                      {getProcLabel(p)}
                    </option>
                  ))}
                </select>
                {selectedProc && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <select
                      value={datePreset}
                      onChange={handlePresetChange}
                      style={{ marginRight: '0.5rem' }}
                    >
                      <option value="custom">Custom</option>
                      <option value="month">This month</option>
                      <option value="q1">Quarter #1</option>
                      <option value="q2">Quarter #2</option>
                      <option value="q3">Quarter #3</option>
                      <option value="q4">Quarter #4</option>
                      <option value="quarter">This quarter</option>
                      <option value="year">This year</option>
                    </select>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setDatePreset('custom');
                      }}
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDatePreset('custom');
                      }}
                      style={{ marginLeft: '0.5rem' }}
                    />
                    {procParams.map((p, i) =>
                      autoParams[i] === null ? (
                        <input
                          key={p}
                          type="text"
                          placeholder={p}
                          value={manualParams[p] || ''}
                          onChange={(e) =>
                            setManualParams((m) => ({ ...m, [p]: e.target.value }))
                          }
                          style={{ marginLeft: '0.5rem' }}
                        />
                      ) : null,
                    )}
                    <button
                      onClick={runReport}
                      style={{ marginLeft: '0.5rem' }}
                      disabled={!allParamsProvided}
                    >
                      Run
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      {table && config && (
        <div style={{ marginBottom: '0.5rem' }}>
          <button onClick={() => tableRef.current?.openAdd()} style={{ marginRight: '0.5rem' }}>
            Гүйлгээ нэмэх
          </button>
          <button onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Хүснэгт нуух' : 'Хүснэгт харах'}
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
          allConfigs={configs}
          initialPerPage={10}
          addLabel="Гүйлгээ нэмэх"
          showTable={showTable}
        />
      )}
      {reportResult && (
        <ReportTable
          procedure={reportResult.name}
          params={reportResult.params}
          rows={reportResult.rows}
        />
      )}
      {transactionNames.length === 0 && (
        <p>Гүйлгээ тохируулаагүй байна.</p>
      )}
    </div>
  );
}
