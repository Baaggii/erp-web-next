// src/erp.mgt.mn/pages/Reports.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import ReportTable from '../components/ReportTable.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';
import useButtonPerms from '../hooks/useButtonPerms.js';
import normalizeDateInput from '../utils/normalizeDateInput.js';

export default function Reports() {
  const { company, branch, department, user } = useContext(AuthContext);
  const buttonPerms = useButtonPerms();
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const [procedures, setProcedures] = useState([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procParams, setProcParams] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [result, setResult] = useState(null);
  const [manualParams, setManualParams] = useState({});
  const presetSelectRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const manualInputRefs = useRef({});
  const runButtonRef = useRef(null);
  const procNames = useMemo(() => procedures.map((p) => p.name), [procedures]);
  const procMap = useHeaderMappings(procNames);

  function getLabel(name) {
    return (
      generalConfig.general?.procLabels?.[name] || procMap[name] || name
    );
  }

  useEffect(() => {
    const prefix = generalConfig?.general?.reportProcPrefix || '';
    const params = new URLSearchParams();
    if (branch) params.set('branchId', branch);
    if (department) params.set('departmentId', department);
    if (prefix) params.set('prefix', prefix);
    fetch(
      `/api/report_procedures${
        params.toString() ? `?${params.toString()}` : ''
      }`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => {
        const list = Array.isArray(data.procedures)
          ? data.procedures.map((p) =>
              typeof p === 'string' ? { name: p, isDefault: data.isDefault } : p,
            )
          : [];
        setProcedures(list);
      })
      .catch(() => setProcedures([]));
  }, [branch, department, generalConfig?.general?.reportProcPrefix]);

  useEffect(() => {
    if (!selectedProc) {
      setProcParams([]);
      setManualParams({});
      return;
    }
    const params = new URLSearchParams();
    if (branch) params.set('branchId', branch);
    if (department) params.set('departmentId', department);
    fetch(
      `/api/procedures/${encodeURIComponent(selectedProc)}/params${
        params.toString() ? `?${params.toString()}` : ''
      }`,
      {
        credentials: 'include',
      },
    )
      .then((res) => (res.ok ? res.json() : { parameters: [] }))
      .then((data) => setProcParams(data.parameters || []))
      .catch(() => setProcParams([]));
  }, [selectedProc, branch, department]);

  useEffect(() => {
    setResult(null);
    setManualParams({});
  }, [selectedProc]);

  const dateParamInfo = useMemo(() => {
    const info = {
      hasStartParam: false,
      hasEndParam: false,
      managedIndices: new Set(),
    };
    procParams.forEach((param, index) => {
      const name = param.toLowerCase();
      const isStart = name.includes('start') || name.includes('from');
      const isEnd = name.includes('end') || name.includes('to');
      if (isStart) {
        info.hasStartParam = true;
        info.managedIndices.add(index);
      }
      if (isEnd) {
        info.hasEndParam = true;
        info.managedIndices.add(index);
      }
    });
    return info;
  }, [procParams]);

  const { hasStartParam, hasEndParam, managedIndices } = dateParamInfo;
  const hasDateParams = hasStartParam || hasEndParam;

  const autoParams = useMemo(() => {
    return procParams.map((p) => {
      const name = p.toLowerCase();
      if (name.includes('start') || name.includes('from')) return startDate || null;
      if (name.includes('end') || name.includes('to')) return endDate || null;
      if (name.includes('branch')) return branch ?? null;
      if (name.includes('department')) return department ?? null;
      if (name.includes('company')) return company ?? null;
      if (name.includes('user') || name.includes('emp')) return user?.empid ?? null;
      return null;
    });
  }, [procParams, startDate, endDate, company, branch, department, user]);

  const manualParamNames = useMemo(() => {
    return procParams.reduce((list, param, index) => {
      if (managedIndices.has(index)) return list;
      if (autoParams[index] !== null) return list;
      list.push(param);
      return list;
    }, []);
  }, [procParams, managedIndices, autoParams]);

  const activeControlRefs = useMemo(() => {
    const refs = [];
    if (hasDateParams) refs.push(presetSelectRef);
    if (hasStartParam) refs.push(startDateRef);
    if (hasEndParam) refs.push(endDateRef);

    const manualRefNames = new Set(manualParamNames);
    Object.keys(manualInputRefs.current).forEach((name) => {
      if (!manualRefNames.has(name)) delete manualInputRefs.current[name];
    });

    manualParamNames.forEach((name) => {
      if (!manualInputRefs.current[name]) {
        manualInputRefs.current[name] = React.createRef();
      }
      refs.push(manualInputRefs.current[name]);
    });

    refs.push(runButtonRef);
    return refs;
  }, [hasDateParams, hasStartParam, hasEndParam, manualParamNames]);

  useEffect(() => {
    if (!selectedProc) return;
    const firstFocusable = activeControlRefs.find((ref) => ref?.current);
    if (firstFocusable) {
      firstFocusable.current.focus();
    }
  }, [selectedProc, activeControlRefs]);

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

  function handleParameterKeyDown(event, currentRef) {
    if (event.key !== 'Enter') return;
    const currentIndex = activeControlRefs.findIndex((ref) => ref === currentRef);
    if (currentIndex === -1) return;
    event.preventDefault();
    const nextRef = activeControlRefs[currentIndex + 1];
    if (nextRef?.current) {
      nextRef.current.focus();
      return;
    }
    runReport();
  }

  function handlePresetChange(e) {
    const value = e.target.value;
    setDatePreset(value);
    if (value === 'custom') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start, end;
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
    if (hasStartParam) {
      setStartDate(normalizeDateInput(fmt(start), 'YYYY-MM-DD'));
    }
    if (hasEndParam) {
      setEndDate(normalizeDateInput(fmt(end), 'YYYY-MM-DD'));
    }
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
    const label = getLabel(selectedProc);
    addToast(`Calling ${label}`, 'info');
    try {
      const q = new URLSearchParams();
      if (branch) q.set('branchId', branch);
      if (department) q.set('departmentId', department);
      const res = await fetch(
        `/api/procedures${q.toString() ? `?${q.toString()}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: selectedProc, params: finalParams }),
        },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({ row: [] }));
        const rows = Array.isArray(data.row) ? data.row : [];
        addToast(
          `${label} returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
          'success',
        );
        setResult({
          name: selectedProc,
          params: paramMap,
          rows,
          fieldTypeMap: data.fieldTypeMap || {},
        });
      } else {
        addToast('Failed to run procedure', 'error');
      }
    } catch {
      addToast('Failed to run procedure', 'error');
    }
  }

  return (
    <div>
      <h2>Тайлан</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <select
          value={selectedProc}
          onChange={(e) => {
            setSelectedProc(e.target.value);
            setDatePreset('custom');
            setStartDate('');
            setEndDate('');
          }}
          disabled={procedures.length === 0}
        >
          <option value="">-- select --</option>
          {procedures.map((p) => (
            <option key={p.name} value={p.name}>
              {getLabel(p.name)} {p.isDefault ? '(default)' : '(company)'}
            </option>
          ))}
        </select>
        {procedures.length === 0 && (
          <span style={{ marginLeft: '0.5rem' }}>Тайлан тохируулаагүй байна.</span>
        )}
        {selectedProc && (
          <div style={{ marginTop: '0.5rem' }}>
            {hasDateParams && (
              <select
                value={datePreset}
                onChange={handlePresetChange}
                style={{ marginRight: '0.5rem' }}
                ref={presetSelectRef}
                onKeyDown={(event) => handleParameterKeyDown(event, presetSelectRef)}
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
            )}
            {hasStartParam && (
              <CustomDatePicker
                value={startDate}
                onChange={(v) => {
                  setStartDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                inputRef={startDateRef}
                onKeyDown={(event) => handleParameterKeyDown(event, startDateRef)}
              />
            )}
            {hasEndParam && (
              <CustomDatePicker
                value={endDate}
                onChange={(v) => {
                  setEndDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                style={{ marginLeft: '0.5rem' }}
                inputRef={endDateRef}
                onKeyDown={(event) => handleParameterKeyDown(event, endDateRef)}
              />
            )}
            {procParams.map((p, i) => {
              if (managedIndices.has(i)) return null;
              if (autoParams[i] !== null) return null;
              const val = manualParams[p] || '';
              const inputRef = manualInputRefs.current[p];
              return (
                <input
                  key={p}
                  type="text"
                  placeholder={p}
                  value={val}
                  onChange={(e) =>
                    setManualParams((m) => ({ ...m, [p]: e.target.value }))
                  }
                  style={{ marginLeft: '0.5rem' }}
                  ref={inputRef}
                  onKeyDown={(event) => handleParameterKeyDown(event, inputRef)}
                />
              );
            })}
            <button
              onClick={runReport}
              style={{ marginLeft: '0.5rem' }}
              disabled={!allParamsProvided}
              ref={runButtonRef}
              onKeyDown={(event) => handleParameterKeyDown(event, runButtonRef)}
            >
              Run
            </button>
          </div>
        )}
      </div>
      {result && (
        <ReportTable
          procedure={result.name}
          params={result.params}
          rows={result.rows}
          buttonPerms={buttonPerms}
          fieldTypeMap={result.fieldTypeMap}
        />
      )}
    </div>
  );
}
