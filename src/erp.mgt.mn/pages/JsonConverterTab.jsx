import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.25rem' }}>{title}</h3>
      {children}
    </div>
  );
}

function ScriptPreview({ plans, scriptText, onDownload }) {
  if (!plans || plans.length === 0) return null;
  return (
    <div style={{ marginTop: '1rem', background: '#f9fafb', padding: '1rem', borderRadius: 6 }}>
      <h4 style={{ marginTop: 0 }}>Conversion Preview</h4>
      <ul style={{ paddingLeft: '1.25rem' }}>
        {plans.map((plan) => (
          <li key={plan.column}>
            <strong>{plan.column}</strong>: {plan.preview}
            {plan.backupName && (
              <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                Backup column: {plan.backupName}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.875rem', color: '#374151' }}>Generated SQL</div>
        <button onClick={onDownload}>Download script</button>
      </div>
      <pre
        style={{
          background: '#111827',
          color: '#e5e7eb',
          padding: '0.75rem',
          borderRadius: 6,
          overflowX: 'auto',
          marginTop: '0.5rem',
        }}
      >
        {scriptText}
      </pre>
    </div>
  );
}

export default function JsonConverterTab() {
  const { addToast } = useToast();
  const [tables, setTables] = useState([]);
  const [tableFilter, setTableFilter] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(new Set());
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [keepBackup, setKeepBackup] = useState(true);
  const [planPreview, setPlanPreview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch('/api/json-conversions/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(Array.isArray(data) ? data : []))
      .catch(() => setTables([]));
    refreshLogs();
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      setColumns([]);
      setSelectedColumns(new Set());
      return;
    }
    setLoadingColumns(true);
    fetch(`/api/json-conversions/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setColumns(Array.isArray(data) ? data : []);
        setSelectedColumns(new Set());
      })
      .catch(() => {
        setColumns([]);
        addToast('Failed to load columns', 'error');
      })
      .finally(() => setLoadingColumns(false));
  }, [selectedTable, addToast]);

  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableFilter]);

  const toggleColumn = (name) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  function downloadScript(scriptText, filename = 'json-conversion.sql') {
    const blob = new Blob([scriptText], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function refreshLogs() {
    try {
      const res = await fetch('/api/json-conversions/logs', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setLogs(data);
    } catch {
      // ignore
    }
  }

  async function runConversion(execute = false) {
    if (!selectedTable || selectedColumns.size === 0) {
      addToast('Select at least one column', 'error');
      return;
    }
    if (execute) {
      const proceed = window.confirm(
        'Convert selected fields to JSON? Make sure you are in a maintenance window.',
      );
      if (!proceed) return;
    }
    setRunning(true);
    try {
      const body = {
        table: selectedTable,
        columns: Array.from(selectedColumns),
        keepBackup,
        execute,
      };
      const res = await fetch('/api/json-conversions/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Conversion failed');
      }
      const data = await res.json();
      setPlanPreview(data);
      addToast(execute ? 'Conversion completed' : 'Preview ready', 'success');
      refreshLogs();
      if (execute) {
        setSelectedColumns(new Set());
        setColumns((prev) =>
          prev.map((col) =>
            data.plans?.some((p) => p.column === col.name)
              ? { ...col, isJson: true }
              : col,
          ),
        );
      }
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Conversion failed', 'error');
    } finally {
      setRunning(false);
    }
  }

  async function rerunLog(id) {
    const proceed = window.confirm('Re-run this conversion script?');
    if (!proceed) return;
    try {
      const res = await fetch(`/api/json-conversions/logs/${id}/run`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to run script');
      }
      addToast('Script executed', 'success');
      refreshLogs();
    } catch (err) {
      addToast(err.message || 'Failed to run script', 'error');
    }
  }

  return (
    <div>
      <Section title="Safety checks">
        <ul style={{ paddingLeft: '1.25rem', color: '#374151', marginTop: 0 }}>
          <li>Confirm downstream views and reports before changing column types.</li>
          <li>Prefer running conversions during maintenance windows to avoid locks.</li>
          <li>Download the generated SQL for offline backups before execution.</li>
        </ul>
      </Section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
        <div>
          <Section title="Tables">
            <input
              type="text"
              placeholder="Search tables..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              style={{ width: '100%', marginBottom: '0.5rem' }}
            />
            <div
              style={{
                maxHeight: '300px',
                overflow: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
              }}
            >
              {filteredTables.map((t) => (
                <div
                  key={t.name}
                  style={{
                    padding: '0.5rem',
                    cursor: 'pointer',
                    background: selectedTable === t.name ? '#eef2ff' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => setSelectedTable(t.name)}
                >
                  <span>{t.name}</span>
                  {t.hasConversions && (
                    <span style={{ color: '#2563eb', fontSize: '0.85rem' }}>JSON ready</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
        <div>
          <Section title="Columns">
            {loadingColumns && <div>Loading columns…</div>}
            {!loadingColumns && selectedTable && columns.length === 0 && (
              <div>No columns found for {selectedTable}</div>
            )}
            {!loadingColumns && columns.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.5rem',
                }}
              >
                {columns.map((col) => (
                  <label
                    key={col.name}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      padding: '0.5rem',
                      background: col.isJson ? '#ecfccb' : '#fff',
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={col.isJson}
                      checked={selectedColumns.has(col.name)}
                      onChange={() => toggleColumn(col.name)}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{col.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                        {col.label || col.name} • {col.dataType || col.columnType || 'unknown'}
                      </div>
                      {col.isJson && (
                        <div style={{ fontSize: '0.8rem', color: '#16a34a' }}>Already JSON</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label>
                <input
                  type="checkbox"
                  checked={keepBackup}
                  onChange={(e) => setKeepBackup(e.target.checked)}
                />{' '}
                Keep backup of original scalar column
              </label>
              <button onClick={() => runConversion(false)} disabled={running}>
                Preview conversion
              </button>
              <button onClick={() => runConversion(true)} disabled={running}>
                Convert now
              </button>
            </div>
          </Section>
        </div>
      </div>
      {planPreview && (
        <ScriptPreview
          plans={planPreview.plans || []}
          scriptText={planPreview.scriptText || ''}
          onDownload={() =>
            downloadScript(
              planPreview.scriptText || '',
              `${selectedTable || 'conversion'}.sql`,
            )
          }
        />
      )}
      <Section title="Saved scripts">
        {logs.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No saved scripts yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Table</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Column</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Run at</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Run by</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem' }}>{log.table_name}</td>
                  <td style={{ padding: '0.5rem' }}>{log.column_name}</td>
                  <td style={{ padding: '0.5rem' }}>{log.run_at || 'Pending'}</td>
                  <td style={{ padding: '0.5rem' }}>{log.run_by || '—'}</td>
                  <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => downloadScript(log.script_text, `${log.table_name}_${log.column_name}.sql`)}>
                      Download
                    </button>
                    <button onClick={() => rerunLog(log.id)}>Re-run</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
