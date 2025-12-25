import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function useTables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!mounted) return;
        setTables(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Failed to load tables');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { tables, loading, error };
}

function useTableColumns(table) {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!table) {
      setColumns([]);
      setError('');
      return;
    }
    let mounted = true;
    setLoading(true);
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!mounted) return;
        setColumns(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Failed to load columns');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [table]);

  return { columns, loading, error };
}

function useConversionLogs(table) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = React.useCallback(() => {
    let mounted = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (table) params.set('table', table);
    fetch(`/api/json_conversion/logs?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!mounted) return;
        setLogs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Failed to load logs');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [table]);

  useEffect(() => refresh(), [refresh]);

  return { logs, loading, error, refresh };
}

function Preview({ selected }) {
  const entries = Object.entries(selected).filter(([, v]) => v);
  if (entries.length === 0) return <p>Select columns to preview conversion.</p>;
  return (
    <div style={{ marginTop: '1rem' }}>
      <h4>Conversion Preview</h4>
      <ul>
        {entries.map(([col]) => (
          <li key={col}>
            <code>{col}</code>: <code>{'"123"'} → ['123']</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CodingTablesJsonConverter() {
  const { tables, loading: tablesLoading, error: tablesError } = useTables();
  const [table, setTable] = useState('');
  const { columns, loading: colsLoading, error: colsError } = useTableColumns(table);
  const [selected, setSelected] = useState({});
  const [keepBackup, setKeepBackup] = useState(true);
  const [scriptText, setScriptText] = useState('');
  const { addToast } = useToast();
  const { logs, refresh: refreshLogs } = useConversionLogs(table);
  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  useEffect(() => {
    setSelected({});
    setScriptText('');
  }, [table]);

  const runConversion = async () => {
    if (!table || selectedCount === 0) return;
    const columnsToConvert = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    try {
      const res = await fetch('/api/json_conversion/convert', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: table, columns: columnsToConvert, keepBackup }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Conversion failed');
      setScriptText(data.scriptText || '');
      addToast('Conversion executed and logged', 'success');
      refreshLogs();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to convert fields', 'error');
    }
  };

  const saveScriptOnly = async () => {
    if (!table || selectedCount === 0) return;
    const columnsToConvert = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const script = columnsToConvert
      .map(
        (col) => `-- Convert ${table}.${col}\nALTER TABLE \`${table}\` MODIFY COLUMN \`${col}\` JSON;\nUPDATE \`${table}\` SET \`${col}\` = JSON_ARRAY(\`${col}\`) WHERE \`${col}\` IS NOT NULL;`,
      )
      .join('\n\n');
    try {
      const res = await fetch('/api/json_conversion/logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: table, columnName: columnsToConvert[0], scriptText: script }),
      });
      if (!res.ok) throw new Error('Failed to save script');
      setScriptText(script);
      addToast('Script saved without executing', 'success');
      refreshLogs();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to save script', 'error');
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>JSON Converter</h2>
      {tablesError && <p style={{ color: 'red' }}>{tablesError}</p>}
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Select table:{' '}
          <select value={table} onChange={(e) => setTable(e.target.value)} disabled={tablesLoading}>
            <option value="">-- choose table --</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {colsError && <p style={{ color: 'red' }}>{colsError}</p>}
      {colsLoading && <p>Loading columns...</p>}
      {columns.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4>Columns</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '240px', overflowY: 'auto', border: '1px solid #e5e7eb', padding: '0.5rem' }}>
            {columns.map((col) => (
              <label key={col.name || col} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={!!selected[col.name || col]}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [col.name || col]: e.target.checked }))
                  }
                />
                <span>
                  {col.label || col.name || col}
                  {col.columnType ? <span style={{ color: '#6b7280' }}> ({col.columnType})</span> : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <input
          type="checkbox"
          checked={keepBackup}
          onChange={(e) => setKeepBackup(e.target.checked)}
        />{' '}
        Keep backup of old scalar column (recommended)
      </label>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button type="button" onClick={runConversion} disabled={selectedCount === 0 || !table}>
          Convert & Execute
        </button>
        <button type="button" onClick={saveScriptOnly} disabled={selectedCount === 0 || !table}>
          Save Script Only
        </button>
      </div>

      <Preview selected={selected} />

      {scriptText && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Generated Script</h4>
          <textarea value={scriptText} readOnly rows={8} style={{ width: '100%' }} />
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <h4>Saved Scripts</h4>
        <button type="button" onClick={() => refreshLogs()} style={{ marginBottom: '0.5rem' }}>
          Refresh
        </button>
        {logs.length === 0 ? (
          <p>No saved scripts</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.25rem' }}>Table</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.25rem' }}>Column</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.25rem' }}>Run At</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.25rem' }}>Run By</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '0.25rem' }}>Script</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #f3f4f6' }}>{log.tableName}</td>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #f3f4f6' }}>{log.columnName}</td>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #f3f4f6' }}>{log.runAt}</td>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #f3f4f6' }}>{log.runBy}</td>
                  <td style={{ padding: '0.25rem', borderBottom: '1px solid #f3f4f6' }}>
                    <textarea value={log.scriptText} readOnly rows={4} style={{ width: '100%' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
