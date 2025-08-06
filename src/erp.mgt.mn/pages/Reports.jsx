// src/erp.mgt.mn/pages/Reports.jsx
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

export default function Reports() {
  const { company, user } = useContext(AuthContext);
  const { addToast } = useToast();
  const [procedures, setProcedures] = useState([]);
  const [selectedProc, setSelectedProc] = useState('');
  const [procParams, setProcParams] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('moduleKey', 'reports');
    if (company?.branch_id !== undefined)
      params.set('branchId', company.branch_id);
    if (company?.department_id !== undefined)
      params.set('departmentId', company.department_id);
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const set = new Set();
        Object.values(data || {}).forEach((cfg) => {
          if (Array.isArray(cfg.procedures)) {
            cfg.procedures.forEach((p) => set.add(p));
          }
        });
        setProcedures(Array.from(set).sort());
      })
      .catch(() => setProcedures([]));
  }, [company?.branch_id, company?.department_id]);

  useEffect(() => {
    if (!selectedProc) {
      setProcParams([]);
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
  }, [selectedProc]);

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
    setStartDate(fmt(start));
    setEndDate(fmt(end));
  }

  async function runReport() {
    if (!selectedProc) return;
    const paramMap = procParams.reduce((acc, p, i) => {
      acc[p] = autoParams[i];
      return acc;
    }, {});
    addToast(`Calling ${selectedProc}`, 'info');
    try {
      const res = await fetch('/api/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: selectedProc, params: autoParams }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ row: [] }));
        const rows = Array.isArray(data.row) ? data.row : [];
        addToast(
          `${selectedProc} returned ${rows.length} row${rows.length === 1 ? '' : 's'}`,
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
      {procedures.length > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <select
            value={selectedProc}
            onChange={(e) => {
              setSelectedProc(e.target.value);
              setDatePreset('custom');
              setStartDate('');
              setEndDate('');
            }}
          >
            <option value="">-- select --</option>
            {procedures.map((p) => (
              <option key={p} value={p}>
                {p}
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
              <button onClick={runReport} style={{ marginLeft: '0.5rem' }}>
                Run
              </button>
            </div>
          )}
        </div>
      ) : (
        <p>Тайлан тохируулаагүй байна.</p>
      )}
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <h4>
            {result.name}
            {Object.keys(result.params).length > 0 && (
              <span>
                {' '}
                (
                {Object.entries(result.params)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', ')}
                )
              </span>
            )}
          </h4>
          {result.rows.length > 0 ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {Object.keys(result.rows[0]).map((col) => (
                    <th key={col} style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, idx) => (
                  <tr key={idx}>
                    {Object.keys(result.rows[0]).map((col) => (
                      <td key={col} style={{ padding: '0.25rem 0.5rem' }}>
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No data</p>
          )}
        </div>
      )}
    </div>
  );
}
