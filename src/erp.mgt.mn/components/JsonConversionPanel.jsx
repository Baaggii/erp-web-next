import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function toCsv(items) {
  return items.join(', ');
}

export default function JsonConversionPanel() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [scriptText, setScriptText] = useState('');
  const [savedScripts, setSavedScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/json_conversion/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { tables: [] }))
      .then((data) => setTables(data.tables || []))
      .catch(() => setTables([]));
  }, []);

  useEffect(() => {
    fetch('/api/json_conversion/scripts', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { scripts: [] }))
      .then((data) => setSavedScripts(data.scripts || []))
      .catch(() => setSavedScripts([]));
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      setColumns([]);
      setSelectedColumns([]);
      return;
    }
    setLoading(true);
    fetch(`/api/json_conversion/tables/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { columns: [] }))
      .then((data) => {
        setColumns(data.columns || []);
        setSelectedColumns([]);
      })
      .catch(() => {
        setColumns([]);
        setSelectedColumns([]);
      })
      .finally(() => setLoading(false));
  }, [selectedTable]);

  function toggleColumn(name) {
    setSelectedColumns((prev) => {
      if (prev.includes(name)) {
        return prev.filter((c) => c !== name);
      }
      return [...prev, name];
    });
  }

  function handleDownload(script) {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'json-conversion.sql';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleConvert() {
    if (!selectedTable || selectedColumns.length === 0) {
      addToast('Pick a table and at least one column', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/json_conversion/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table: selectedTable,
          columns: selectedColumns,
          backup: backupEnabled,
          runNow: true,
        }),
      });
      if (!res.ok) throw new Error('Conversion failed');
      const data = await res.json();
      setPreviews(data.previews || []);
      setScriptText(data.scriptText || '');
      addToast('Conversion script generated', 'success');
      const scripts = await fetch('/api/json_conversion/scripts', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { scripts: [] }))
        .catch(() => ({ scripts: [] }));
      setSavedScripts(scripts.scripts || []);
    } catch (err) {
      console.error(err);
      addToast('Failed to convert columns', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunScript(id) {
    setLoading(true);
    try {
      const res = await fetch(`/api/json_conversion/scripts/${id}/run`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Run failed');
      addToast('Script executed', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to execute script', 'error');
    } finally {
      setLoading(false);
    }
  }

  const selectedPreviewText = useMemo(
    () =>
      selectedColumns.length > 0
        ? `Selected: ${toCsv(selectedColumns)}`
        : 'No columns selected',
    [selectedColumns],
  );

  return (
    <div>
      <h2>JSON Converter</h2>
      <p>
        Convert scalar columns into JSON arrays, preview the migration script, and keep an
        audit log for replays across environments.
      </p>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label>
          Table:{' '}
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            disabled={loading}
          >
            <option value="">Select table</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={backupEnabled}
            onChange={(e) => setBackupEnabled(e.target.checked)}
            disabled={loading}
          />{' '}
          Keep scalar backup column
        </label>
        <button type="button" onClick={handleConvert} disabled={loading}>
          Convert
        </button>
      </div>

      {selectedTable && (
        <div style={{ marginTop: '1rem' }}>
          <strong>Columns for {selectedTable}</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {columns.map((col) => (
              <label
                key={col.name}
                style={{
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '0.35rem 0.5rem',
                  backgroundColor: selectedColumns.includes(col.name) ? '#eef5ff' : '#fff',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col.name)}
                  onChange={() => toggleColumn(col.name)}
                  disabled={loading}
                />{' '}
                {col.name} <span style={{ color: '#666' }}>({col.type})</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', color: '#555' }}>{selectedPreviewText}</div>
        </div>
      )}

      {previews.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Preview</h4>
          <ul>
            {previews.map((p) => (
              <li key={p.column}>
                <strong>{p.column}</strong> ({p.originalType}): {p.exampleBefore} →{' '}
                {p.exampleAfter}. {p.notes}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scriptText && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Generated Script</h4>
          <textarea value={scriptText} readOnly rows={8} cols={100} />
          <div>
            <button type="button" onClick={() => handleDownload(scriptText)} disabled={loading}>
              Download SQL
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <h4>Saved Scripts</h4>
        {savedScripts.length === 0 ? (
          <div>No saved scripts yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Table</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Columns</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Last Run</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Run By</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {savedScripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.table_name}</td>
                  <td>{s.column_name}</td>
                  <td>{s.run_at ? new Date(s.run_at).toLocaleString() : '—'}</td>
                  <td>{s.run_by || '—'}</td>
                  <td>
                    <button type="button" onClick={() => handleRunScript(s.id)} disabled={loading}>
                      Run
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => handleDownload(s.script_text)}
                      disabled={loading}
                    >
                      Download
                    </button>
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
