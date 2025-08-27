// src/erp.mgt.mn/pages/Reports.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';
import ReportTable from '../components/ReportTable.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import CustomDatePicker from '../components/CustomDatePicker.jsx';

function normalizeDateInput(value, format) {
  if (typeof value !== 'string') return value;
  let v = value.trim().replace(/^(\d{4})[.,](\d{2})[.,](\d{2})/, '$1-$2-$3');
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v))) {
    const local = formatTimestamp(new Date(v));
    return format === 'HH:MM:SS' ? local.slice(11, 19) : local.slice(0, 10);
  }
  return v;
}

export default function Reports() {
  const { company, branch, user, permissions: perms } = useContext(AuthContext);
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
  const procMap = useHeaderMappings(procedures);

  function getLabel(name) {
    return (
      generalConfig.general?.procLabels?.[name] || procMap[name] || name
    );
  }

  useEffect(() => {
    const prefix = generalConfig?.general?.reportProcPrefix || '';
    fetch(
      `/api/procedures${
        prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
      }`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => {
        const list = Array.isArray(data.procedures) ? data.procedures : [];
        setProcedures(list);
      })
      .catch(() => setProcedures([]));
  }, [generalConfig?.general?.reportProcPrefix]);

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
    setResult(null);
    setManualParams({});
  }, [selectedProc]);

  const autoParams = useMemo(() => {
    return procParams.map((p) => {
      const name = p.toLowerCase();
      if (name.includes('start') || name.includes('from')) return startDate || null;
      if (name.includes('end') || name.includes('to')) return endDate || null;
      if (name.includes('branch')) return branch ?? null;
      if (name.includes('company')) return company ?? null;
      if (name.includes('user') || name.includes('emp')) return user?.empid ?? null;
      return null;
    });
  }, [procParams, startDate, endDate, company, branch, user]);

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
    setStartDate(normalizeDateInput(fmt(start), 'YYYY-MM-DD'));
    setEndDate(normalizeDateInput(fmt(end), 'YYYY-MM-DD'));
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
        setResult({ name: selectedProc, params: paramMap, rows });
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
            <option key={p} value={p}>
              {getLabel(p)}
            </option>
          ))}
        </select>
        {procedures.length === 0 && (
          <span style={{ marginLeft: '0.5rem' }}>Тайлан тохируулаагүй байна.</span>
        )}
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
              <CustomDatePicker
                value={startDate}
                onChange={(v) => {
                  setStartDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
              />
              <CustomDatePicker
                value={endDate}
                onChange={(v) => {
                  setEndDate(normalizeDateInput(v, 'YYYY-MM-DD'));
                  setDatePreset('custom');
                }}
                style={{ marginLeft: '0.5rem' }}
              />
              {procParams.map((p, i) => {
                if (autoParams[i] !== null) return null;
                const lower = p.toLowerCase();
                const val = manualParams[p] || '';
                if (lower.includes('date')) {
                  return (
                    <CustomDatePicker
                      key={p}
                      value={val}
                      onChange={(v) =>
                        setManualParams((m) => ({
                          ...m,
                          [p]: normalizeDateInput(v, 'YYYY-MM-DD'),
                        }))
                      }
                      placeholder={p}
                      style={{ marginLeft: '0.5rem' }}
                    />
                  );
                }
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
                  />
                );
              })}
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
      {result && (
        <ReportTable
          procedure={result.name}
          params={result.params}
          rows={result.rows}
          buttonPerms={perms?.buttons || {}}
        />
      )}
    </div>
  );
}
