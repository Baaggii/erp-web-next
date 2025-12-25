import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

function normalizeColumns(rawCols = []) {
  return rawCols
    .map((col) => {
      if (!col) return null;
      if (typeof col === 'string') {
        return { name: col, type: '' };
      }
      const name = col.column_name || col.name || col.field || col.Field;
      if (!name) return null;
      return { name, type: col.data_type || col.type || col.Type || '' };
    })
    .filter(Boolean);
}

function buildScript(table, column, withBackup = true) {
  const safeTable = `\`${table}\``;
  const safeColumn = `\`${column}\``;
  const backupColumn = `\`${column}_old\``;

  const statements = [];
  if (withBackup) {
    statements.push(
      `ALTER TABLE ${safeTable} ADD COLUMN IF NOT EXISTS ${backupColumn} TEXT;`,
      `UPDATE ${safeTable} SET ${backupColumn} = ${safeColumn} WHERE ${safeColumn} IS NOT NULL;`,
    );
  }
  statements.push(
    `ALTER TABLE ${safeTable} MODIFY COLUMN ${safeColumn} JSON;`,
    `UPDATE ${safeTable} SET ${safeColumn} = JSON_ARRAY(${withBackup ? backupColumn : safeColumn}) WHERE ${withBackup ? backupColumn : safeColumn} IS NOT NULL;`,
  );
  return statements.join('\n');
}

function PreviewRow({ column }) {
  const sampleValue = column?.sample ?? '123';
  const preview = Array.isArray(sampleValue)
    ? sampleValue
    : [sampleValue];
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: '1px solid #ddd',
        padding: '0.5rem 0.75rem',
        borderRadius: '6px',
        marginBottom: '0.5rem',
      }}
    >
      <div>
        <strong>{column.name}</strong>
        <div style={{ fontSize: '0.85rem', color: '#666' }}>
          {column.type || 'Scalar'} → JSON array
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.85rem', color: '#444' }}>
          <code>{JSON.stringify(sampleValue)}</code>
          {' → '}
          <code>{JSON.stringify(preview)}</code>
        </div>
      </div>
    </div>
  );
}

export default function CodingTablesJsonConverter() {
  const { addToast } = useToast();
  const { user } = useContext(AuthContext);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(() => new Set());
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [scriptPreview, setScriptPreview] = useState('');
  const [executing, setExecuting] = useState(false);
  const [savedScripts, setSavedScripts] = useState([]);
  const [withBackup, setWithBackup] = useState(true);

  const sortedTables = useMemo(
    () =>
      [...tables].sort((a, b) => String(a.label || a.value || a).localeCompare(String(b.label || b.value || b))),
    [tables],
  );

  useEffect(() => {
    async function fetchTables() {
      setLoadingTables(true);
      try {
        const res = await fetch('/api/tenant_tables/options', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setTables(Array.isArray(data) ? data : []);
        } else {
          const fallback = await fetch('/api/tenant_tables', { credentials: 'include' });
          const data = fallback.ok ? await fallback.json() : [];
          setTables(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load tables', err);
        addToast('Unable to load tables for JSON conversion.', 'error');
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    }
    fetchTables();
  }, [addToast]);

  useEffect(() => {
    async function fetchSaved() {
      try {
        const res = await fetch('/api/json_conversion/logs', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) setSavedScripts(data);
      } catch {
        // ignore missing endpoint; keep UI usable
      }
    }
    fetchSaved();
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      setColumns([]);
      setSelectedColumns(new Set());
      return;
    }
    setLoadingColumns(true);
    fetch(`/api/tables/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setColumns(normalizeColumns(data));
        setSelectedColumns(new Set());
      })
      .catch((err) => {
        console.error('Failed to load columns', err);
        addToast('Unable to load columns for the selected table.', 'error');
        setColumns([]);
      })
      .finally(() => setLoadingColumns(false));
  }, [selectedTable, addToast]);

  const selectedList = useMemo(
    () => columns.filter((c) => selectedColumns.has(c.name)),
    [columns, selectedColumns],
  );

  function toggleColumn(name) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function generateScriptPreview() {
    if (!selectedTable || selectedList.length === 0) {
      addToast('Choose at least one column to convert.', 'warning');
      return;
    }
    const script = selectedList
      .map((col) => buildScript(selectedTable, col.name, withBackup))
      .join('\n\n');
    setScriptPreview(script);
  }

  async function recordScript(table, column, script) {
    const payload = {
      table_name: table,
      column_name: column,
      script_text: script,
      run_at: new Date().toISOString(),
      run_by: user?.username || user?.name || 'admin',
    };
    try {
      const res = await fetch('/api/json_conversion/logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json().catch(() => payload);
      setSavedScripts((prev) => [saved, ...prev]);
    } catch (err) {
      console.warn('Failed to persist JSON conversion log', err);
      setSavedScripts((prev) => [payload, ...prev]);
    }
  }

  async function executeScripts() {
    if (!selectedTable || selectedList.length === 0) {
      addToast('Select a table and at least one field before converting.', 'error');
      return;
    }
    const script = selectedList
      .map((col) => buildScript(selectedTable, col.name, withBackup))
      .join('\n\n');
    setExecuting(true);
    try {
      const res = await fetch('/api/json_conversion/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: selectedTable, columns: selectedList.map((c) => c.name), script }),
      });
      if (res.ok) {
        addToast('JSON conversion script executed.', 'success');
      } else {
        addToast('Conversion request queued. Please verify in maintenance window.', 'info');
      }
      setScriptPreview(script);
      await Promise.all(
        selectedList.map((col) => recordScript(selectedTable, col.name, script)),
      );
    } catch (err) {
      console.error('Conversion failed', err);
      addToast('Unable to execute conversion. Download the script for manual run.', 'error');
    } finally {
      setExecuting(false);
    }
  }

  function downloadScript(text) {
    const blob = new Blob([text], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable || 'conversion'}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function rerunSaved(entry) {
    try {
      const res = await fetch('/api/json_conversion/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: entry.table_name, columns: [entry.column_name], script: entry.script_text }),
      });
      if (res.ok) {
        addToast('Saved script re-executed.', 'success');
      } else {
        addToast('Script queued or needs manual execution.', 'info');
      }
    } catch (err) {
      console.error('Failed to re-run saved script', err);
      addToast('Unable to re-run script; please download and run manually.', 'error');
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Database table
          </label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            disabled={loadingTables}
            style={{ width: '100%', padding: '0.5rem' }}
          >
            <option value="" disabled>
              {loadingTables ? 'Loading tables...' : 'Select table'}
            </option>
            {sortedTables.map((tbl) => {
              const value = tbl.value || tbl.table || tbl;
              const label = tbl.label || tbl.name || value;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
          <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Pick the table whose scalar fields need to become JSON arrays.
          </p>
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
            Safety options
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={withBackup}
              onChange={(e) => setWithBackup(e.target.checked)}
            />
            Keep a backup column during conversion
          </label>
          <p style={{ color: '#b4690e', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Run conversions during maintenance windows to avoid table locks.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h3>Fields to convert</h3>
        {loadingColumns && <div>Loading columns…</div>}
        {!loadingColumns && columns.length === 0 && (
          <div style={{ color: '#666' }}>Select a table to load its fields.</div>
        )}
        {!loadingColumns && columns.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '0.75rem',
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            {columns.map((col) => (
              <label
                key={col.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.25rem',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.has(col.name)}
                  onChange={() => toggleColumn(col.name)}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{col.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#555' }}>
                    {col.type || 'Unknown type'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedList.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h3>Preview</h3>
          <p style={{ color: '#555', marginTop: 0 }}>
            Each selected field will be converted to a JSON array while keeping its original name.
          </p>
          {selectedList.map((col) => (
            <PreviewRow key={col.name} column={col} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={generateScriptPreview} disabled={selectedList.length === 0}>
          Generate SQL
        </button>
        <button onClick={executeScripts} disabled={executing || selectedList.length === 0}>
          {executing ? 'Converting…' : 'Convert & log'}
        </button>
        <button
          onClick={() => downloadScript(scriptPreview || 'SELECT 1;')}
          disabled={!scriptPreview}
        >
          Download script
        </button>
      </div>

      {scriptPreview && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3>Generated SQL</h3>
          <textarea
            value={scriptPreview}
            readOnly
            rows={10}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </div>
      )}

      <div>
        <h3>Saved scripts</h3>
        {savedScripts.length === 0 && (
          <p style={{ color: '#666' }}>
            Scripts will appear here after you run a conversion. They can be re-applied in staging or production.
          </p>
        )}
        {savedScripts.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '0.75rem',
              display: 'grid',
              gap: '0.75rem',
            }}
          >
            {savedScripts.map((entry, idx) => (
              <div
                key={`${entry.table_name}-${entry.column_name}-${idx}`}
                style={{
                  border: '1px solid #f0f0f0',
                  padding: '0.75rem',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{entry.table_name}</strong> · {entry.column_name}
                    {entry.run_at && (
                      <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                        ({entry.run_at})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#555' }}>
                    Run by {entry.run_by || 'unknown'}
                  </div>
                </div>
                <pre
                  style={{
                    background: '#f9fafb',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    overflowX: 'auto',
                  }}
                >
{entry.script_text}
                </pre>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => rerunSaved(entry)}>Re-run</button>
                  <button onClick={() => downloadScript(entry.script_text || '')}>
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
