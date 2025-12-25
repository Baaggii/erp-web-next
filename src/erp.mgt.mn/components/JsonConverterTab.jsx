import React, { useEffect, useMemo, useState } from 'react';
import formatTimestamp from '../utils/formatTimestamp.js';
import { useToast } from '../context/ToastContext.jsx';

function normalizeType(col = {}) {
  return (
    col.type ||
    col.columnType ||
    col.dataType ||
    col.DATA_TYPE ||
    ''
  ).toLowerCase();
}

function buildScript(table, columns, { keepBackup = true } = {}) {
  if (!table || !Array.isArray(columns) || columns.length === 0) return '';
  const parts = [];
  columns.forEach((col) => {
    const colName = String(col || '').trim();
    if (!colName) return;
    const safeColumn = `\`${colName}\``;
    const backupName = keepBackup ? `\`${colName}_backup\`` : null;
    const alterBackup = backupName
      ? `ALTER TABLE \`${table}\` ADD COLUMN IF NOT EXISTS ${backupName} TEXT;`
      : '';
    const copyBackup = backupName
      ? `UPDATE \`${table}\` SET ${backupName} = ${safeColumn} WHERE ${safeColumn} IS NOT NULL;`
      : '';
    const alterColumn = `ALTER TABLE \`${table}\`\n  MODIFY COLUMN ${safeColumn} JSON;`;
    const updateValues = `UPDATE \`${table}\`\n  SET ${safeColumn} = JSON_ARRAY(${safeColumn})\n  WHERE ${safeColumn} IS NOT NULL AND JSON_TYPE(${safeColumn}) IS NULL;`;
    const block = [alterBackup, copyBackup, alterColumn, updateValues]
      .filter(Boolean)
      .join('\n');
    parts.push(block);
  });
  return parts.join('\n\n');
}

function downloadText(text, filename = 'json-conversion.sql') {
  if (!text) return;
  const blob = new Blob([text], { type: 'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JsonConverterTab() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [columnLoading, setColumnLoading] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(new Set());
  const [keepBackup, setKeepBackup] = useState(true);
  const [scriptText, setScriptText] = useState('');
  const [savedScripts, setSavedScripts] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let canceled = false;
    setTableLoading(true);
    fetch('/api/report_builder/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { tables: [] }))
      .then((data) => {
        if (canceled) return;
        const list = data.tables || data || [];
        setTables(Array.isArray(list) ? list : []);
        if (list && list[0]) {
          setSelectedTable(list[0]);
        }
      })
      .catch(() => setTables([]))
      .finally(() => {
        if (!canceled) setTableLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedColumns(new Set());
  }, [selectedTable]);

  useEffect(() => {
    if (!selectedTable) {
      setColumns([]);
      setSelectedColumns(new Set());
      return;
    }
    let canceled = false;
    setColumnLoading(true);
    fetch(`/api/tables/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (canceled) return;
        setColumns(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!canceled) setColumns([]);
      })
      .finally(() => {
        if (!canceled) setColumnLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [selectedTable]);

  useEffect(() => {
    setLogLoading(true);
    fetch('/api/json_conversion/logs', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const entries = Array.isArray(data?.logs) ? data.logs : Array.isArray(data) ? data : [];
        setSavedScripts(entries);
      })
      .catch(() => setSavedScripts([]))
      .finally(() => setLogLoading(false));
  }, []);

  const previewRows = useMemo(
    () =>
      Array.from(selectedColumns).map((col) => ({
        column: col,
        preview: `"value" → ["value"]`,
      })),
    [selectedColumns],
  );

  useEffect(() => {
    if (!selectedTable) {
      setScriptText('');
      return;
    }
    setScriptText(buildScript(selectedTable, Array.from(selectedColumns), { keepBackup }));
  }, [selectedColumns, selectedTable, keepBackup]);

  const toggleColumn = (col) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };

  async function handleConvert(runScript) {
    if (!selectedTable || selectedColumns.size === 0) {
      addToast('Select at least one column to convert.', 'error');
      return;
    }
    const payload = {
      table: selectedTable,
      columns: Array.from(selectedColumns),
      keepBackup,
      script: scriptText,
    };
    setRunning(true);
    try {
      const res = await fetch('/api/json_conversion/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, runScript }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to queue conversion');
      }
      addToast(runScript ? 'Conversion script executed.' : 'Conversion script saved.', 'success');
      const now = new Date();
      setSavedScripts((prev) => [
        {
          table_name: selectedTable,
          column_name: payload.columns.join(', '),
          script_text: scriptText,
          run_at: formatTimestamp(now),
          run_by: 'me',
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Unable to run conversion.', 'error');
    } finally {
      setRunning(false);
    }
  }

  const rerunScript = async (entry) => {
    if (!entry?.script_text) return;
    const columns =
      entry.column_name || entry.columnName || entry.columns
        ? String(entry.column_name || entry.columnName || entry.columns)
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
    setRunning(true);
    try {
      const res = await fetch('/api/json_conversion/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table: entry.table_name,
          columns,
          script: entry.script_text,
          runScript: true,
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to rerun script');
      }
      addToast('Script re-run successfully.', 'success');
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Unable to re-run script.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const tableTypeMap = useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      const name = col.name || col.columnName || col.COLUMN_NAME;
      if (!name) return;
      map[name] = normalizeType(col);
    });
    return map;
  }, [columns]);

  return (
    <div style={{ marginTop: '1rem' }}>
      <h2>JSON Converter</h2>
      <p style={{ maxWidth: 720 }}>
        Convert scalar columns into JSON arrays with an audit-friendly script. Select a table,
        choose columns, preview the migration SQL, then execute or download the script. Previously
        executed scripts are kept below for reuse across environments.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label>
          Table{' '}
          <select
            disabled={tableLoading}
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
          >
            {tables.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={keepBackup}
            onChange={(e) => setKeepBackup(e.target.checked)}
          />{' '}
          Keep scalar backup column
        </label>
        <button
          type="button"
          onClick={() => downloadText(scriptText, `${selectedTable || 'table'}-json-conversion.sql`)}
          disabled={!scriptText}
        >
          Download SQL
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3>Columns</h3>
        {columnLoading && <div>Loading columns…</div>}
        {!columnLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {columns.map((col) => {
              const name = col.name || col.columnName || col.COLUMN_NAME;
              const typ = tableTypeMap[name] || '';
              const isJson = typ.includes('json');
              return (
                <label
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: isJson ? '#f5fbff' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.has(name)}
                    onChange={() => toggleColumn(name)}
                  />
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  <span style={{ color: '#666', fontSize: 12 }}>{typ || 'unknown'}</span>
                  {isJson && <span title="Already JSON" aria-label="JSON field">📄</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3>Preview</h3>
        {previewRows.length === 0 ? (
          <div>Select columns to see the JSON conversion preview.</div>
        ) : (
          <ul>
            {previewRows.map((row) => (
              <li key={row.column}>
                <strong>{row.column}</strong>: {row.preview}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3>Generated SQL</h3>
        <textarea
          rows={8}
          cols={80}
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder="SQL will appear here after selecting columns"
        />
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => handleConvert(false)} disabled={running}>
            Save Migration
          </button>
          <button type="button" onClick={() => handleConvert(true)} disabled={running}>
            Run Conversion
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h3>Saved Scripts</h3>
        {logLoading && <div>Loading saved scripts…</div>}
        {!logLoading && savedScripts.length === 0 && <div>No saved scripts yet.</div>}
        {!logLoading && savedScripts.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Table</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Columns</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Run At</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Run By</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {savedScripts.map((entry, idx) => {
                const tableName = entry.table_name || entry.tableName || '';
                const columnName = entry.column_name || entry.columnName || entry.columns || '';
                return (
                  <tr key={`${tableName}-${columnName}-${idx}`}>
                    <td style={{ padding: '0.35rem 0' }}>{tableName}</td>
                    <td>{columnName}</td>
                    <td>{entry.run_at || entry.runAt || ''}</td>
                    <td>{entry.run_by || entry.runBy || ''}</td>
                    <td>
                      <button type="button" onClick={() => rerunScript(entry)} disabled={running}>
                        Re-run
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadText(entry.script_text, `${tableName}-json.sql`)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
