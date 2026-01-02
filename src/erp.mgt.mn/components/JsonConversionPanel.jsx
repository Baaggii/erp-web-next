import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function toCsv(items) {
  return items.join(', ');
}

export default function JsonConversionPanel() {
  const { addToast } = useToast();
  const hasShownDbUserToast = useRef(false);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState([]);
  const [dbEngine, setDbEngine] = useState('');
  const [columnConfigs, setColumnConfigs] = useState({});
  const [previews, setPreviews] = useState([]);
  const [scriptText, setScriptText] = useState('');
  const [savedScripts, setSavedScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [blockedColumns, setBlockedColumns] = useState([]);
  const [errorDetails, setErrorDetails] = useState(null);
  const [expandedConstraints, setExpandedConstraints] = useState({});

  const selectedColumns = useMemo(
    () =>
      Object.entries(columnConfigs)
        .filter(([, cfg]) => cfg?.selected)
        .map(([name]) => name),
    [columnConfigs],
  );

  useEffect(() => {
    if (!hasShownDbUserToast.current) {
      addToast(
        'JSON Converter uses ERP_ADMIN_USER, then DB_ADMIN_USER, then DB_USER for DB access. Ensure an admin credential is configured to avoid CREATE privilege errors.',
        'info',
      );
      hasShownDbUserToast.current = true;
    }
  }, [addToast]);

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
      setColumnConfigs({});
      return;
    }
    setLoading(true);
    fetch(`/api/json_conversion/tables/${encodeURIComponent(selectedTable)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { columns: [] }))
      .then((data) => {
        setColumns(data.columns || []);
        setDbEngine(data.dbEngine || '');
        setColumnConfigs({});
      })
      .catch(() => {
        setColumns([]);
        setDbEngine('');
        setColumnConfigs({});
      })
      .finally(() => setLoading(false));
  }, [selectedTable]);

  useEffect(() => {
    if (dbEngine === 'MariaDB') {
      addToast(
        'Constraint detection is limited on MariaDB. Foreign keys will be dropped automatically on convert.',
        'warning',
      );
    }
  }, [dbEngine, addToast]);

  const hasForeignKeyConstraint = (meta) =>
    Array.isArray(meta?.constraintTypes) &&
    meta.constraintTypes.some((type) => String(type || '').toUpperCase() === 'FOREIGN KEY');

  const shouldHandleConstraintsByDefault = (meta) =>
    Boolean(meta?.hasBlockingConstraint) || hasForeignKeyConstraint(meta);

  function defaultActionForColumn(meta) {
    if (meta?.isPrimaryKey) return 'companion';
    if (hasForeignKeyConstraint(meta)) return 'convert';
    return 'convert';
  }

  function toggleColumn(name) {
    const meta = columns.find((c) => c.name === name);
    setColumnConfigs((prev) => {
      const existing = prev[name] || {};
      const nextSelected = !existing.selected;
      const nextAction = nextSelected ? existing.action || defaultActionForColumn(meta) : 'skip';
      const defaultHandleConstraints =
        existing.handleConstraints ??
        (shouldHandleConstraintsByDefault(meta) || nextAction === 'convert');
      return {
        ...prev,
        [name]: {
          selected: nextSelected,
          action: nextAction,
          handleConstraints: nextSelected && defaultHandleConstraints,
          customSql: existing.customSql || '',
        },
      };
    });
  }

  function updateAction(name, action) {
    const meta = columns.find((c) => c.name === name);
    if (meta?.isPrimaryKey && action === 'convert') {
      addToast(
        'Primary key columns should remain scalar. Prefer the companion JSON column option.',
        'warning',
      );
    }
    setColumnConfigs((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || { selected: true }),
        selected: true,
        action,
        handleConstraints: action === 'convert',
        customSql: action === 'manual' ? prev[name]?.customSql || '' : prev[name]?.customSql || '',
      },
    }));
  }

  function updateCustomSql(name, value) {
    setColumnConfigs((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || { selected: true }),
        selected: true,
        action: prev[name]?.action || 'manual',
        customSql: value,
      },
    }));
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
    addToast(
      'Conversion uses admin DB credentials in the order ERP_ADMIN_USER → DB_ADMIN_USER → DB_USER. Ensure they have CREATE privileges for json_conversion_log.',
      'info',
    );
    if (!selectedTable || selectedColumns.length === 0) {
      addToast('Pick a table and at least one column', 'warning');
      return;
    }

    const missingManualSql = [];
    const criticalConflicts = [];
    const payloadColumns = selectedColumns.map((col) => {
      const meta = columns.find((c) => c.name === col);
      const cfg = columnConfigs[col] || {};
      const action = cfg.action || defaultActionForColumn(meta);
      if (meta?.isPrimaryKey && action === 'convert') {
        criticalConflicts.push(col);
      }
      if (action === 'manual' && meta?.hasBlockingConstraint && !(cfg.customSql || '').trim()) {
        missingManualSql.push(col);
      }
      return {
        name: col,
        action,
        handleConstraints: action === 'convert',
        customSql: (cfg.customSql || '').trim() || undefined,
      };
    });

    if (criticalConflicts.length > 0) {
      addToast(
        `Do not convert critical keys directly: ${criticalConflicts.join(', ')}. Use the companion JSON option instead.`,
        'warning',
      );
      return;
    }
    if (missingManualSql.length > 0) {
      addToast(
        `Provide SQL steps for manual constraint handling: ${missingManualSql.join(', ')}`,
        'warning',
      );
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
          columns: payloadColumns,
          backup: backupEnabled,
          runNow: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviews(data.previews || []);
        setScriptText(data.scriptText || '');
        setBlockedColumns(data.blockedColumns || []);
        const reason = data?.message || 'Conversion failed while dropping/reapplying constraints';
        addToast(reason, 'error');
        return;
      }
      setPreviews(data.previews || []);
      setScriptText(data.scriptText || '');
      setBlockedColumns(data.blockedColumns || []);
      setErrorDetails(null);
      if (data.executed) {
        addToast('Constraints dropped/reapplied and conversion executed successfully.', 'success');
      } else {
        addToast('Conversion script generated; run to drop constraints and apply changes.', 'info');
      }
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

  function handleLoadScript(script) {
    setScriptText(script || '');
    addToast('Loaded script into preview', 'info');
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

  function renderScriptResult(resultStatus, resultError) {
    if (!resultStatus) return '—';
    if (resultStatus === 'success') return 'Success';
    if (resultStatus === 'planned') return 'Planned';
    if (resultStatus === 'error') {
      const message =
        typeof resultError === 'object'
          ? resultError?.message || resultError?.sqlMessage
          : String(resultError || '');
      return message ? `Error: ${message}` : 'Error';
    }
    return resultStatus;
  }

  const selectedPreviewText = useMemo(
    () => {
      if (selectedColumns.length === 0) return 'No columns selected';
      const summary = selectedColumns.map((name) => {
        const meta = columns.find((c) => c.name === name);
        const action = (columnConfigs[name] || {}).action || defaultActionForColumn(meta);
        return `${name} (${action})`;
      });
      return `Selected: ${toCsv(summary)}`;
    },
    [selectedColumns, columnConfigs, columns],
  );

  const aggregatedDiagnostics = useMemo(() => {
    const seen = new Set();
    const queries = [];
    previews.forEach((p) => {
      (p.diagnosticQueries || []).forEach((q) => {
        const trimmed = String(q || '').trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        queries.push(trimmed);
      });
    });
    return queries;
  }, [previews]);

  function toggleConstraintDetails(name) {
    setExpandedConstraints((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }

  function renderConstraintSummary(col, expanded) {
    const constraints = col.constraints || [];
    const triggers = col.triggers || [];
    const warnings = [];
    if (col.isPrimaryKey) {
      warnings.push('Primary key column: prefer keeping scalar.');
    }
    (col.blockingReasons || []).forEach((reason) => warnings.push(reason));
    if (constraints.length === 0 && triggers.length === 0 && warnings.length === 0) {
      return <span style={{ color: '#166534' }}>No dependent constraints detected</span>;
    }
    const total = constraints.length + triggers.length + warnings.length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#b45309' }}>
          <span style={{ fontWeight: 600 }}>Constraints detected ({total})</span>
          <button type="button" onClick={() => toggleConstraintDetails(col.name)} style={{ padding: '0.2rem 0.4rem' }}>
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {warnings.map((warning) => (
              <div key={warning} style={{ color: '#b45309', fontSize: '0.85rem' }}>
                {warning}
              </div>
            ))}
            {constraints.map((c) => (
              <div key={`${c.name}-${c.table}-${c.type}`} style={{ fontSize: '0.85rem' }}>
                <strong>{c.type}</strong> — {c.table}.{c.column}
                {c.referencedTable && c.referencedColumn
                  ? ` → ${c.referencedTable}.${c.referencedColumn}`
                  : ''}{' '}
                {c.direction === 'incoming' ? '(referenced by another table)' : ''}
              </div>
            ))}
            {triggers.map((t) => (
              <div key={t.name} style={{ fontSize: '0.85rem' }}>
                Trigger <strong>{t.name}</strong> ({t.timing} {t.event})
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
          Keep scalar backup column (recommended)
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
                  minWidth: '14rem',
                }}
              >
                {(() => {
                  const isSelected = selectedColumns.includes(col.name);
                  const config = columnConfigs[col.name] || {};
                  const action = config.action || defaultActionForColumn(col);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleColumn(col.name)}
                          disabled={loading}
                        />{' '}
                        <div>
                          <div>
                            {col.name}{' '}
                            <span style={{ color: '#666' }}>({col.type})</span>
                            {col.hasBlockingConstraint && (
                              <span
                                style={{ color: '#b45309', marginLeft: '0.35rem', fontWeight: 600 }}
                              >
                                ⚠️ Constraints detected
                              </span>
                            )}
                            {col.isPrimaryKey && (
                              <span
                                style={{ color: '#b91c1c', marginLeft: '0.35rem', fontWeight: 700 }}
                              >
                                Primary key
                              </span>
                            )}
                          </div>
                          {renderConstraintSummary(col, Boolean(expandedConstraints[col.name]))}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label>
                            Action:{' '}
                            <select
                              value={action}
                              onChange={(e) => updateAction(col.name, e.target.value)}
                              disabled={loading}
                            >
                              <option value="convert">Convert (drop/reapply constraints)</option>
                              <option value="manual">
                                Manual SQL required before conversion (provide snippet)
                              </option>
                              <option value="companion">
                                Add companion JSON column, keep scalar column
                              </option>
                              <option value="skip">Skip this column</option>
                            </select>
                          </label>
                          {action === 'manual' && (
                            <textarea
                              rows={3}
                              placeholder="SQL steps to drop or adjust constraints manually before conversion"
                              value={config.customSql || ''}
                              onChange={(e) => updateCustomSql(col.name, e.target.value)}
                              disabled={loading}
                            />
                          )}
                          {action === 'convert' && col.hasBlockingConstraint && (
                            <div style={{ color: '#b45309', fontSize: '0.9rem' }}>
                              Constraints will be dropped and re-applied in the generated script (handleConstraints enabled).
                            </div>
                          )}
                          {action === 'companion' && (
                            <div style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                              A new JSON column will be added to store multi-value data while the
                              original scalar column remains untouched.
                            </div>
                          )}
                          {action === 'skip' && (
                            <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                              This column will be left unchanged.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </label>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', color: '#555' }}>{selectedPreviewText}</div>
          {blockedColumns.length > 0 && (
            <div style={{ marginTop: '0.5rem', color: '#b45309' }}>
              Skipped columns awaiting manual constraint handling: {blockedColumns.join(', ')}
            </div>
          )}
        </div>
      )}

      {previews.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          {aggregatedDiagnostics.length > 0 && (
            <div
              style={{
                padding: '0.75rem',
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                marginBottom: '0.75rem',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                Run diagnostic queries to uncover hidden constraints/triggers before converting:
              </div>
              <ol style={{ paddingLeft: '1.25rem', marginTop: '0.35rem' }}>
                {aggregatedDiagnostics.map((q) => (
                  <li key={q} style={{ wordBreak: 'break-all' }}>
                    <code>{q}</code>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <h4>Preview</h4>
          <ul>
            {previews.map((p) => (
              <li key={p.column}>
                <strong>{p.column}</strong> ({p.originalType}): {p.exampleBefore} →{' '}
                {p.exampleAfter}. {p.notes}
                {Array.isArray(p.diagnosticQueries) && p.diagnosticQueries.length > 0 && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                      Diagnostic queries to uncover hidden constraints/triggers:
                    </div>
                    <ol style={{ paddingLeft: '1.25rem' }}>
                      {p.diagnosticQueries.map((q) => (
                        <li key={q} style={{ wordBreak: 'break-all' }}>
                          <code>{q}</code>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errorDetails && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff7ed', border: '1px solid #fdba74' }}>
          <strong style={{ color: '#9a3412' }}>Conversion error</strong>
          <div style={{ marginTop: '0.35rem', color: '#7c2d12' }}>
            {errorDetails.message || 'Conversion failed during execution.'}
          </div>
          {errorDetails.statement && (
            <div style={{ marginTop: '0.35rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#0f172a' }}>
              {errorDetails.statementIndex !== undefined && errorDetails.statementIndex !== null
                ? `Statement #${errorDetails.statementIndex + 1}: `
                : 'Statement: '}
              {errorDetails.statement}
            </div>
          )}
          {errorDetails.code && (
            <div style={{ marginTop: '0.2rem', color: '#7c2d12' }}>SQL Code: {errorDetails.code}</div>
          )}
          {errorDetails.sqlState && (
            <div style={{ marginTop: '0.2rem', color: '#7c2d12' }}>SQL State: {errorDetails.sqlState}</div>
          )}
          <div style={{ marginTop: '0.35rem', color: '#7c2d12' }}>
            Review constraints/triggers on the column, drop them, and rerun with “convert” + handleConstraints enabled.
          </div>
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
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Result</th>
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
                  <td>{renderScriptResult(s.result_status, s.result_error)}</td>
                  <td>{s.run_at ? new Date(s.run_at).toLocaleString() : '—'}</td>
                  <td>{s.run_by || '—'}</td>
                  <td>
                    <button type="button" onClick={() => handleRunScript(s.id)} disabled={loading}>
                      Run
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => handleLoadScript(s.script_text)}
                      disabled={loading}
                    >
                      Load
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
