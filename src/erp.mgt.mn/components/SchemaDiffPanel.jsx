import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function summarizePath(p) {
  if (!p) return '';
  const parts = p.split(/[\\/]+/);
  if (parts.length <= 3) return p;
  return `${parts.slice(0, 2).join('/')}/.../${parts.slice(-1)[0]}`;
}

function StatementList({ statements }) {
  if (!statements?.length) {
    return <div style={{ fontStyle: 'italic' }}>No statements for this selection.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {statements.map((stmt, idx) => (
        <div
          key={`${stmt.sql.slice(0, 20)}-${idx}`}
          style={{
            border: '1px solid #ddd',
            borderLeft: stmt.type === 'drop' ? '4px solid #d00' : '4px solid #0f62fe',
            padding: '0.5rem',
            background: stmt.type === 'drop' ? '#fff5f5' : '#f9fbff',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.25rem', fontWeight: 'bold' }}>
            {stmt.type?.toUpperCase() || 'SQL'}
          </div>
          {stmt.sql}
        </div>
      ))}
    </div>
  );
}

export default function SchemaDiffPanel() {
  const { addToast } = useToast();
  const [schemaPath, setSchemaPath] = useState('db');
  const [schemaFile, setSchemaFile] = useState('schema.sql');
  const [includeDrops, setIncludeDrops] = useState(false);
  const [includeGeneral, setIncludeGeneral] = useState(true);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedObjects, setSelectedObjects] = useState(new Set());
  const [activeObject, setActiveObject] = useState('');
  const [applyResult, setApplyResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [preflight, setPreflight] = useState({ loading: true, ok: false, issues: [], warnings: [], data: null });
  const [dumpStatus, setDumpStatus] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    setError('');
  }, [schemaPath, schemaFile]);

  useEffect(() => {
    if (!window.io) return undefined;
    if (!socketRef.current) {
      socketRef.current = window.io();
    }
    const socket = socketRef.current;
    const handler = (payload) => {
      if (payload?.jobId && payload.jobId !== jobId) return;
      if (payload?.message) setDumpStatus(payload.message);
    };
    socket.on('schema-diff-progress', handler);
    return () => {
      socket.off('schema-diff-progress', handler);
    };
  }, [jobId]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function checkPrerequisites() {
      setPreflight((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/coding_tables/schema-diff/check');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || 'Unable to check schema diff prerequisites.');
        }
        if (!active) return;
        setPreflight({
          loading: false,
          ok: data.ok !== false && (!data.issues || data.issues.length === 0),
          issues: data.issues || [],
          warnings: data.warnings || [],
          data,
        });
        if (data.issues?.length) {
          setError(data.issues.join('; '));
        } else {
          setError('');
        }
      } catch (err) {
        if (!active) return;
        setPreflight({
          loading: false,
          ok: false,
          issues: [err.message || 'Unable to check schema diff prerequisites.'],
          warnings: [],
          data: null,
        });
        setError(err.message || 'Unable to check schema diff prerequisites.');
      }
    }
    checkPrerequisites();
    return () => {
      active = false;
    };
  }, []);

  const selectedSql = useMemo(() => {
    if (!diff) return [];
    const sql = [];
    if (includeGeneral && diff.generalStatements) {
      diff.generalStatements.forEach((stmt) => {
        if (includeDrops || stmt.type !== 'drop') sql.push(stmt.sql);
      });
    }
    (diff.tables || []).forEach((t) => {
      if (selectedObjects.has(t.key)) {
        t.statements.forEach((stmt) => {
          if (includeDrops || stmt.type !== 'drop') sql.push(stmt.sql);
        });
      }
    });
    return sql;
  }, [diff, selectedObjects, includeDrops, includeGeneral]);

  const activeTableData = useMemo(() => {
    if (!diff) return null;
    if (!activeObject && diff.tables?.length) return diff.tables[0];
    return diff.tables?.find((t) => t.key === activeObject) || null;
  }, [diff, activeObject]);

  const criticalPrereqIssues = useMemo(
    () => (preflight.issues || []).filter((issue) => /db_name/i.test(issue)),
    [preflight.issues],
  );
  const hasValidSchemaInputs =
    Boolean(schemaPath && schemaPath.trim()) && Boolean(schemaFile && schemaFile.trim());
  const disableGenerate =
    loading ||
    preflight.loading ||
    !hasValidSchemaInputs ||
    jobId ||
    criticalPrereqIssues.length > 0;

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    let intervalId;
    async function poll() {
      try {
        const res = await fetch(`/api/coding_tables/schema-diff/jobs/${jobId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.message || 'Failed to check schema diff job status');
        }
        setJobStatus(data);
        const status = data.status;
        if (status === 'completed' && data.result) {
          setDiff(data.result);
          setSelectedObjects(new Set((data.result.tables || []).map((t) => t.key)));
          setActiveObject(data.result.tables?.[0]?.key || '');
          setApplyResult(null);
          setError('');
          setJobStatus(null);
          setJobId(null);
          setLoading(false);
          setDumpStatus('');
          addToast('Schema diff generated', 'success');
          return;
        }
        if (status === 'failed' || status === 'cancelled') {
          const msg = data.error?.message || `Schema diff ${status}.`;
          setError(msg);
          addToast(msg, 'error');
          setJobStatus(data);
          setJobId(null);
          setLoading(false);
          setDumpStatus('');
          return;
        }
        if (status === 'running') {
          const started = data.startedAt ? new Date(data.startedAt).getTime() : null;
          if (started && Date.now() - started > 60_000) {
            setDumpStatus('Schema dump is taking longer than expected. Please stay on this tab or cancel the request.');
          }
        }
        setLoading(true);
      } catch (err) {
        if (cancelled) return;
        const msg = err.message || 'Failed to check schema diff job status';
        setError(msg);
        addToast(msg, 'error');
        setJobStatus(null);
        setJobId(null);
        setLoading(false);
        setDumpStatus('');
      }
    }
    poll();
    intervalId = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [jobId, addToast]);

  async function generateDiff() {
    setLoading(true);
    setError('');
    setDiff(null);
    setApplyResult(null);
    setJobStatus(null);
    setDumpStatus('Queueing schema diff job...');
    try {
      if (!hasValidSchemaInputs) {
        setError('Provide both a schema path and a filename to compare.');
        setLoading(false);
        setDumpStatus('');
        return;
      }
      const res = await fetch('/api/coding_tables/schema-diff/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaPath, schemaFile, allowDrops: includeDrops }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to start schema diff job');
      }
      if (!data.jobId) {
        throw new Error('Unable to start schema diff job: missing job id');
      }
      setJobId(data.jobId);
      setDumpStatus('Dump job queued. Waiting for progress...');
      addToast('Schema diff job started', 'info');
    } catch (err) {
      setError(err.message || 'Failed to generate schema diff');
      addToast(err.message || 'Failed to generate schema diff', 'error');
      setLoading(false);
      setDumpStatus('');
    }
  }

  function toggleTable(key) {
    setSelectedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setActiveObject(key);
  }

  function selectAll() {
    if (!diff?.tables) return;
    setSelectedObjects(new Set(diff.tables.map((t) => t.key)));
  }

  function clearSelection() {
    setSelectedObjects(new Set());
  }

  async function applySelected() {
    if (!diff) {
      setError('Generate a diff before applying changes.');
      return;
    }
    if (selectedSql.length === 0) {
      setError('Select at least one object or statement to apply.');
      return;
    }
    setApplying(true);
    setApplyResult(null);
    setError('');
    try {
      const res = await fetch('/api/coding_tables/schema-diff/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statements: selectedSql,
          allowDrops: includeDrops,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to apply schema diff');
      }
      setApplyResult(data);
      const statusMsg = dryRun
        ? 'Diff preview generated'
        : `Applied ${data.applied || 0} statements`;
      addToast(statusMsg, 'success');
    } catch (err) {
      setError(err.message || 'Failed to apply schema diff');
      addToast(err.message || 'Failed to apply schema diff', 'error');
    } finally {
      setApplying(false);
    }
  }

  function copySelectedSql() {
    const payload = selectedSql.join('\n\n');
    navigator.clipboard
      .writeText(payload)
      .then(() => addToast('SQL copied to clipboard', 'success'))
      .catch(() => addToast('Unable to copy SQL to clipboard', 'error'));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'grid',
          gap: '0.5rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          alignItems: 'end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Repository schema directory
          <input
            type="text"
            value={schemaPath}
            onChange={(e) => setSchemaPath(e.target.value)}
            placeholder="e.g. db"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Schema filename
          <input
            type="text"
            value={schemaFile}
            onChange={(e) => setSchemaFile(e.target.value)}
            placeholder="schema.sql"
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" onClick={generateDiff} disabled={disableGenerate}>
            {loading ? 'Generating...' : 'Generate Diff'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input
              type="checkbox"
              checked={includeDrops}
              onChange={(e) => setIncludeDrops(e.target.checked)}
            />
            Include DROP statements when applying
          </label>
        </div>
        {jobId ? (
          <div style={{ color: '#0f62fe', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <strong>Job {jobId}:</strong>
            <span>
              {jobStatus?.status || 'queued'}
              {jobStatus?.status === 'running' && jobStatus?.progress?.length
                ? ` — ${jobStatus.progress[jobStatus.progress.length - 1]?.message || ''}`
                : ''}
            </span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: preflight.ok ? '#0b8457' : '#b00' }}>
          {preflight.loading ? (
            <span>Checking prerequisites...</span>
          ) : preflight.ok ? (
            <span>
              mysqldump and DB_NAME are available.
              {preflight.data?.mysqldbcompareAvailable
                ? ' mysqldbcompare is available for full schema diffs.'
                : ' mysqldbcompare is missing; using the limited fallback diff.'}
            </span>
          ) : (
            <span>
              Prerequisite issues detected: {preflight.issues.join('; ') || 'Unknown issue'}
            </span>
          )}
        </div>
        {!preflight.loading && preflight.warnings?.length ? (
          <div style={{ color: '#b58900', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <strong>Warnings:</strong>
            <span>{preflight.warnings.join('; ')}</span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input
              type="checkbox"
              checked={includeGeneral}
              onChange={(e) => setIncludeGeneral(e.target.checked)}
            />
            Include general statements (SET/metadata)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry-run only
          </label>
        </div>
      </div>

      {error && (
        <div style={{ color: 'red', background: '#fff5f5', padding: '0.5rem' }}>
          {error}
        </div>
      )}
      {loading && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem',
            background: '#eef5ff',
            border: '1px solid #cce5ff',
          }}
        >
          <span style={{ fontWeight: 'bold' }}>⏳ Generating schema diff...</span>
          <span style={{ color: '#555' }}>
            {dumpStatus || 'This may take a few seconds for large schemas.'}
          </span>
        </div>
      )}

      {diff && (
        <>
          <div
            style={{
              border: '1px solid #ddd',
              padding: '0.75rem',
              background: '#f9fbff',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <div>
              <strong>Tool:</strong> {diff.tool}{' '}
              {!diff.toolAvailable && (
                <span style={{ color: '#d00' }}>(mysqldbcompare not available; basic diff used)</span>
              )}
            </div>
            <div>
              <strong>Generated:</strong>{' '}
              {new Date(diff.generatedAt).toLocaleString() || diff.generatedAt}
            </div>
            <div>
              <strong>Current dump:</strong> {summarizePath(diff.currentSchemaPath)} |{' '}
              <strong>Target:</strong> {summarizePath(diff.targetSchemaPath)}
            </div>
            <div>
              <strong>Statements:</strong> {diff.stats?.statementCount || 0} across{' '}
              {diff.stats?.tableCount || 0} objects
            </div>
            {diff.stats?.dropStatements ? (
              <div style={{ color: '#b00', fontWeight: 'bold' }}>
                Drop statements detected: {diff.stats.dropStatements}. They will be skipped unless
                "Include DROP statements" is enabled.
              </div>
            ) : null}
            <div style={{ color: '#b58900' }}>
              Review the generated SQL before applying it to production data. Run a preview first and
              double-check DROP or ALTER statements.
            </div>
            {diff.warnings?.length ? (
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#b58900' }}>
                {diff.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div
              style={{
                minWidth: '260px',
                maxWidth: '320px',
                border: '1px solid #ddd',
                padding: '0.5rem',
                background: '#fafafa',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Objects</strong>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={selectAll}>
                    Select all
                  </button>
                  <button type="button" onClick={clearSelection}>
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {diff.generalStatements?.length ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.35rem',
                      border: '1px solid #eee',
                      background: activeObject === '__general__' ? '#eef5ff' : '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveObject('__general__')}
                  >
                    <input type="checkbox" checked={includeGeneral} disabled />
                    <span style={{ flex: 1, fontWeight: 'bold' }}>General statements</span>
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                      {diff.generalStatements.length} stmt
                    </span>
                  </label>
                ) : null}
                {diff.tables?.length ? (
                  diff.tables.map((t) => (
                    <label
                      key={t.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem',
                        border: '1px solid #eee',
                        background: activeObject === t.key ? '#eef5ff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedObjects.has(t.key)}
                        onChange={() => toggleTable(t.key)}
                      />
                      <span
                        onClick={() => setActiveObject(t.key)}
                        style={{ flex: 1, fontWeight: 'bold' }}
                      >
                        {t.type ? `${t.type}: ${t.name}` : t.name}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#666' }}>
                        {t.statements.length} stmt{t.statements.length !== 1 ? 's' : ''}
                        {t.hasDrops ? ' • DROP' : ''}
                      </span>
                    </label>
                  ))
                ) : (
                  <div style={{ fontStyle: 'italic' }}>No schema changes detected.</div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  {activeTableData
                    ? `Changes for ${activeTableData.type ? `${activeTableData.type}: ` : ''}${activeTableData.name}`
                    : 'No object selected'}
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={copySelectedSql} disabled={!selectedSql.length}>
                    Copy selected SQL
                  </button>
                  <button type="button" onClick={applySelected} disabled={applying || !selectedSql.length}>
                    {applying ? 'Applying...' : dryRun ? 'Preview Selected' : 'Apply Selected'}
                  </button>
                </div>
              </div>
              <StatementList
                statements={
                  activeTableData
                    ? activeTableData.statements.filter(
                        (s) => includeDrops || s.type !== 'drop',
                      )
                    : (diff.generalStatements || []).filter(
                        (s) => includeDrops || s.type !== 'drop',
                      )
                }
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Combined SQL for selected items</strong>
              <span style={{ color: '#666' }}>
                {selectedSql.length} statement{selectedSql.length === 1 ? '' : 's'} ready
              </span>
            </div>
            <textarea
              rows={8}
              value={selectedSql.join('\n\n')}
              readOnly
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </div>

          {applyResult && (
            <div
              style={{
                border: '1px solid #cce5ff',
                background: '#e8f2ff',
                padding: '0.75rem',
              }}
            >
              <div>
                <strong>{dryRun ? 'Preview complete.' : 'Apply complete.'}</strong>{' '}
                {dryRun
                  ? 'Statements were parsed but not executed.'
                  : `Applied ${applyResult.applied || 0} statements.`}
              </div>
              {applyResult.dropStatements ? (
                <div style={{ color: '#b00' }}>
                  Drop statements included: {applyResult.dropStatements}
                </div>
              ) : null}
              {applyResult.failed?.length ? (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ color: '#b00', fontWeight: 'bold' }}>
                    Failed statements (transaction rolled back):
                  </div>
                  <ul>
                    {applyResult.failed.map((f, idx) => (
                      <li key={idx}>
                        {f.statement?.slice(0, 80) || 'Statement'} — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
