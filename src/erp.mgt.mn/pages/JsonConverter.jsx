import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

function JsonConverter() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scripts, setScripts] = useState([]);

  useEffect(() => {
    let canceled = false;
    const normalizeTables = (input) => {
      if (!input) return [];
      if (Array.isArray(input)) return input;
      if (Array.isArray(input?.tables)) return input.tables;
      if (typeof input === 'object') {
        const values = Object.values(input).filter((v) => typeof v === 'string');
        if (values.length) return values;
      }
      return [];
    };
    async function loadTables() {
      try {
        const res = await fetch('/api/json_conversion/tables', { credentials: 'include' });
        let data = res.ok ? await res.json() : [];
        let list = normalizeTables(data);
        if (!list.length) {
          const fallback = await fetch('/api/tables', { credentials: 'include' }).catch(() => null);
          if (fallback?.ok) {
            const alt = await fallback.json().catch(() => []);
            list = normalizeTables(alt);
          }
        }
        if (!canceled) setTables(list);
      } catch (err) {
        console.error('Failed to load tables', err);
        if (!canceled) {
          setTables([]);
          addToast('Failed to load tables', 'error');
        }
      }
    }
    loadTables();
    return () => {
      canceled = true;
    };
  }, [addToast]);

  useEffect(() => {
    if (!selectedTable) return;
    setLoading(true);
    fetch(`/api/json_conversion/tables/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setColumns(Array.isArray(data?.columns) ? data.columns : []);
        setScripts(Array.isArray(data?.logs) ? data.logs : []);
        setSelected(new Set());
      })
      .catch(() => {
        setColumns([]);
        setScripts([]);
        addToast('Failed to load columns', 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedTable, addToast]);

  const toggleSelect = (col) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  const handleConvert = async (run = false) => {
    if (!selectedTable || selected.size === 0) {
      addToast('Select a table and at least one column', 'error');
      return;
    }
    if (
      run &&
      !window.confirm(
        'Running this migration will alter columns immediately. Continue?',
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/json_conversion/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table: selectedTable,
          columns: selectedList,
          run,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to generate conversion script');
      }
      const data = await res.json().catch(() => ({}));
      const newScripts = Array.isArray(data?.scripts) ? data.scripts : [];
      setScripts((prev) => [...newScripts, ...prev]);
      addToast(run ? 'Conversion executed' : 'Script saved', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to convert columns', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRunScript = async (id) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/json_conversion/scripts/${id}/run`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to run script');
      addToast('Script executed', 'success');
      // refresh current table logs
      if (selectedTable) {
        const refresh = await fetch(
          `/api/json_conversion/tables/${encodeURIComponent(selectedTable)}/columns`,
          { credentials: 'include' },
        );
        const data = refresh.ok ? await refresh.json() : {};
        setScripts(Array.isArray(data?.logs) ? data.logs : []);
      }
    } catch (err) {
      addToast(err.message || 'Failed to run script', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadScript = (script) => {
    if (!script?.scriptText) return;
    const blob = new Blob([script.scriptText], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${script.tableName || selectedTable || 'conversion'}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const preview = useMemo(
    () =>
      selectedList.map((col) => ({
        column: col,
        exampleBefore: '"123"',
        exampleAfter: '["123"]',
      })),
    [selectedList],
  );

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>JSON Converter</h3>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          Select table:{' '}
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
          >
            <option value="">{tables.length ? '-- choose --' : 'No tables found'}</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <div>Loading columns...</div>}
      {selectedTable && !loading && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Columns</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
              {columns.map((col) => (
                <label
                  key={col.name}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: col.isJson || col.jsonLogged ? '#f0fdf4' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(col.name)}
                    onChange={() => toggleSelect(col.name)}
                    disabled={col.isJson}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{col.label || col.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {col.name} · {col.dataType}
                      {col.isJson && ' (JSON)'}
                      {col.jsonLogged && ' (converted)'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={() => handleConvert(false)} disabled={saving || selected.size === 0}>
              Save Script
            </button>
            <button
              onClick={() => handleConvert(true)}
              disabled={saving || selected.size === 0}
              style={{ marginLeft: '0.5rem', background: '#16a34a', color: 'white' }}
            >
              Convert Now
            </button>
          </div>
          {preview.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <strong>Preview</strong>
              <ul>
                {preview.map((p) => (
                  <li key={p.column}>
                    <code>{p.column}</code>: {p.exampleBefore} → {p.exampleAfter}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: '1rem' }}>
            <strong>Saved Scripts</strong>
            {scripts.length === 0 && <div style={{ color: '#6b7280' }}>No scripts saved.</div>}
            {scripts.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', padding: '0.35rem' }}>Column</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', padding: '0.35rem' }}>Run at</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', padding: '0.35rem' }}>Run by</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', padding: '0.35rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: '0.35rem', borderBottom: '1px solid #f3f4f6' }}>
                        {s.column_name || s.columnName}
                      </td>
                      <td style={{ padding: '0.35rem', borderBottom: '1px solid #f3f4f6' }}>
                        {s.run_at || s.runAt ? formatTimestamp(s.run_at || s.runAt) : 'Not run'}
                      </td>
                      <td style={{ padding: '0.35rem', borderBottom: '1px solid #f3f4f6' }}>
                        {s.run_by || s.runBy || '—'}
                      </td>
                      <td style={{ padding: '0.35rem', borderBottom: '1px solid #f3f4f6' }}>
                        <button onClick={() => downloadScript(s)}>Download</button>
                        <button
                          onClick={() => handleRunScript(s.id)}
                          style={{ marginLeft: '0.35rem' }}
                          disabled={saving}
                        >
                          Re-run
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default JsonConverter;
