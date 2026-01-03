import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

const GROUP_ORDER = ['table', 'view', 'procedure', 'function', 'trigger', 'index'];
const GROUP_LABELS = {
  table: 'Tables',
  view: 'Views',
  procedure: 'Procedures',
  function: 'Functions',
  trigger: 'Triggers',
  index: 'Indexes',
  other: 'Other',
  general: 'General',
};

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
            borderLeft:
              stmt.type === 'drop'
                ? '4px solid #d00'
                : stmt.type === 'alter'
                  ? '4px solid #ffb000'
                  : '4px solid #0f62fe',
            padding: '0.5rem',
            background: stmt.type === 'drop' ? '#fff5f5' : '#f9fbff',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.25rem', fontWeight: 'bold', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span>{stmt.type?.toUpperCase() || 'SQL'}</span>
            {stmt.risk ? (
              <span
                style={{
                  fontSize: '0.8rem',
                  color: stmt.risk === 'high' ? '#b00' : stmt.risk === 'medium' ? '#b58900' : '#0b8457',
                }}
              >
                {stmt.risk === 'high' ? 'High risk' : stmt.risk === 'medium' ? 'Medium risk' : 'Low risk'}
              </span>
            ) : null}
          </div>
          {stmt.sql}
        </div>
      ))}
    </div>
  );
}

function buildGroupsFromDiff(diff) {
  if (!diff?.groups) return [];
  const entries = GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    items: diff.groups[id] || [],
  })).filter((g) => g.items?.length);
  const otherItems = diff.groups.other || [];
  if (otherItems.length) entries.push({ id: 'other', label: GROUP_LABELS.other, items: otherItems });
  return entries;
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
  const [activeGroup, setActiveGroup] = useState('table');
  const [applyResult, setApplyResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [alterPreviewed, setAlterPreviewed] = useState(false);
  const [routineAcknowledged, setRoutineAcknowledged] = useState(false);
  const [preflight, setPreflight] = useState({ loading: true, ok: false, issues: [], warnings: [], data: null });
  const [dumpStatus, setDumpStatus] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [markingBaseline, setMarkingBaseline] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    setError('');
  }, [schemaPath, schemaFile]);

  useEffect(() => {
    setAlterPreviewed(false);
    setRoutineAcknowledged(false);
    setManualMode(false);
  }, [diff, includeDrops, includeGeneral, selectedObjects, activeGroup]);

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

  const groups = useMemo(() => buildGroupsFromDiff(diff), [diff]);

  const selectedStatements = useMemo(() => {
    if (!diff) return [];
    const sql = [];
    if (includeGeneral && diff.generalStatements) {
      diff.generalStatements.forEach((stmt) => {
        if (includeDrops || stmt.type !== 'drop') {
          sql.push({ ...stmt, objectType: 'general', objectName: 'General' });
        }
      });
    }
    groups.forEach((group) => {
      group.items.forEach((item) => {
        if (selectedObjects.has(item.key)) {
          item.statements.forEach((stmt) => {
            if (includeDrops || stmt.type !== 'drop') {
              sql.push({
                ...stmt,
                objectType: item.type,
                objectName: item.name,
              });
            }
          });
        }
      });
    });
    return sql;
  }, [diff, selectedObjects, includeDrops, includeGeneral, groups]);

  const selectedSql = useMemo(() => selectedStatements.map((s) => s.sql), [selectedStatements]);

  const selectedRiskSummary = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 };
    selectedStatements.forEach((stmt) => {
      if (stmt.risk === 'medium') counts.medium += 1;
      else if (stmt.risk === 'high') counts.high += 1;
      else counts.low += 1;
    });
    return counts;
  }, [selectedStatements]);

  const activeTableData = useMemo(() => {
    if (!diff) return null;
    const group = groups.find((g) => g.id === activeGroup);
    if (!group) return null;
    if (!activeObject && group.items.length) return group.items[0];
    return group.items.find((t) => t.key === activeObject) || null;
  }, [diff, activeObject, activeGroup, groups]);

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
    if (!groups.length) return;
    const currentGroup = groups.find((g) => g.id === activeGroup && g.items?.length);
    if (!currentGroup) {
      const next = groups.find((g) => g.items?.length);
      if (next) {
        setActiveGroup(next.id);
        setActiveObject(next.items?.[0]?.key || '');
      }
    }
  }, [groups, activeGroup]);

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
          const newGroups = buildGroupsFromDiff(data.result);
          const keys = [];
          newGroups.forEach((g) => g.items.forEach((item) => keys.push(item.key)));
          setSelectedObjects(new Set(keys));
          const defaultGroup = newGroups.find((g) => g.items.length)?.id || 'table';
          setActiveGroup(defaultGroup);
          const defaultObject = newGroups.find((g) => g.id === defaultGroup)?.items?.[0]?.key || '';
          setActiveObject(defaultObject);
          setAlterPreviewed(false);
          setRoutineAcknowledged(false);
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

  async function generateDiff(manual = false) {
    setLoading(true);
    setError('');
    setDiff(null);
    setApplyResult(null);
    setActiveObject('');
    setActiveGroup('table');
    setAlterPreviewed(false);
    setRoutineAcknowledged(false);
    setJobStatus(null);
    setManualMode(manual);
    setDumpStatus(manual ? 'Parsing selected schema script...' : 'Queueing schema diff job...');
    try {
      if (!hasValidSchemaInputs) {
        setError('Provide both a schema path and a filename to compare.');
        setLoading(false);
        setDumpStatus('');
        return;
      }
      if (manual) {
        const res = await fetch('/api/coding_tables/schema-diff/parse-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schemaPath, schemaFile }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || 'Failed to parse schema script');
        }
        setDiff(data);
        const newGroups = buildGroupsFromDiff(data);
        const keys = [];
        newGroups.forEach((g) => g.items.forEach((item) => keys.push(item.key)));
        setSelectedObjects(new Set(keys));
        const defaultGroup = newGroups.find((g) => g.items.length)?.id || 'table';
        setActiveGroup(defaultGroup);
        const defaultObject = newGroups.find((g) => g.id === defaultGroup)?.items?.[0]?.key || '';
        setActiveObject(defaultObject);
        setManualMode(true);
        setLoading(false);
        setDumpStatus('');
        addToast('Schema script parsed for manual review', 'success');
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
    const keys = [];
    groups.forEach((g) => {
      g.items.forEach((t) => keys.push(t.key));
    });
    setSelectedObjects(new Set(keys));
  }

  function clearSelection() {
    setSelectedObjects(new Set());
  }

  async function applySelected() {
    if (!diff) {
      setError('Generate a diff before applying changes.');
      return;
    }
    if (selectedStatements.length === 0) {
      setError('Select at least one object or statement to apply.');
      return;
    }
    const hasAlters = selectedStatements.some((s) => s.type === 'alter');
    const hasRoutines = selectedStatements.some(
      (s) => s.objectType === 'procedure' || s.objectType === 'trigger',
    );
    if (!dryRun && hasAlters && !alterPreviewed) {
      setError('Review ALTER statements in a preview before applying.');
      return;
    }
    if (!dryRun && hasRoutines && !routineAcknowledged) {
      setError('Routine changes require explicit acknowledgement.');
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
          statements: selectedStatements,
          allowDrops: includeDrops,
          dryRun,
          alterPreviewed,
          routineAcknowledged,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to apply schema diff');
      }
      setApplyResult(data);
      if (data.dryRun && hasAlters) {
        setAlterPreviewed(true);
      }
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
    const payload = selectedStatements.map((s) => s.sql).join('\n\n');
    navigator.clipboard
      .writeText(payload)
      .then(() => addToast('SQL copied to clipboard', 'success'))
      .catch(() => addToast('Unable to copy SQL to clipboard', 'error'));
  }

  async function markBaseline() {
    if (!schemaPath || !schemaFile) {
      setError('Provide a schema path and filename before marking a baseline.');
      return;
    }
    setMarkingBaseline(true);
    try {
      const res = await fetch('/api/coding_tables/schema-diff/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaPath, schemaFile }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to mark baseline');
      }
      setDiff((prev) =>
        prev
          ? {
              ...prev,
              baseline: {
                ...(prev.baseline || {}),
                ...(data.baseline || {}),
                inSync: true,
                outOfSyncObjects: 0,
              },
            }
          : prev,
      );
      addToast('Baseline saved', 'success');
    } catch (err) {
      setError(err.message || 'Failed to mark baseline');
      addToast(err.message || 'Failed to mark baseline', 'error');
    } finally {
      setMarkingBaseline(false);
    }
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
          <button type="button" onClick={() => generateDiff(true)} disabled={disableGenerate}>
            {loading && manualMode ? 'Parsing...' : 'Manual Script Review'}
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
              {preflight.data?.liquibaseAvailable
                ? ' Liquibase detected for ALTER-aware diffs.'
                : ' Liquibase is missing; using the limited bootstrap diff.'}
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
                <span style={{ color: '#d00' }}>(Liquibase unavailable or failed; bootstrap diff used)</span>
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
              {diff.stats?.objectCount || 0} objects
            </div>
            <div>
              <strong>Risk:</strong>{' '}
              {`Low ${diff.stats?.riskCounts?.low || 0} • Medium ${diff.stats?.riskCounts?.medium || 0} • High ${diff.stats?.riskCounts?.high || 0}`}
            </div>
            {diff.stats?.dropStatements ? (
              <div style={{ color: '#b00', fontWeight: 'bold' }}>
                Drop statements detected: {diff.stats.dropStatements}. They will be skipped unless
                "Include DROP statements" is enabled.
              </div>
            ) : null}
            {diff.baseline ? (
              <div style={{ color: diff.baseline.inSync ? '#0b8457' : '#b58900' }}>
                Baseline: {diff.baseline.path || 'Not set'}{' '}
                {diff.baseline.recordedAt
                  ? `(recorded ${new Date(diff.baseline.recordedAt).toLocaleDateString()})`
                  : '(unrecorded)'}{' '}
                | Current DB:{' '}
                {diff.baseline.inSync
                  ? 'in sync'
                  : `out of sync (${diff.baseline.outOfSyncObjects || 0} objects)`}
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
            <div>
              <button
                type="button"
                onClick={markBaseline}
                disabled={markingBaseline}
                style={{ marginTop: '0.5rem' }}
              >
                {markingBaseline ? 'Saving baseline...' : 'Mark schema as baseline'}
              </button>
            </div>
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
              {diff.generalStatements?.length ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.35rem',
                    border: '1px solid #eee',
                    background: includeGeneral ? '#eef5ff' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeGeneral}
                    onChange={(e) => setIncludeGeneral(e.target.checked)}
                  />
                  <span style={{ flex: 1, fontWeight: 'bold' }}>General statements</span>
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>
                    {diff.generalStatements.length} stmt
                  </span>
                </label>
              ) : null}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {GROUP_ORDER.map((id) => {
                  const label = GROUP_LABELS[id];
                  const count = groups.find((g) => g.id === id)?.items?.length || 0;
                  const isActive = activeGroup === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveGroup(id)}
                      disabled={count === 0}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: isActive ? '#0f62fe' : '#fff',
                        color: isActive ? '#fff' : '#333',
                        border: '1px solid #0f62fe',
                        opacity: count === 0 ? 0.6 : 1,
                      }}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {groups.find((g) => g.id === activeGroup)?.items?.length ? (
                  groups
                    .find((g) => g.id === activeGroup)
                    ?.items.map((t) => (
                      <label
                        key={t.key}
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
                          {t.name}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#666', textAlign: 'right' }}>
                          {t.statements.length} stmt{t.statements.length !== 1 ? 's' : ''}
                          {t.hasDrops ? ' • DROP' : ''}
                        </span>
                      </label>
                    ))
                ) : (
                  <div style={{ fontStyle: 'italic' }}>No changes in this category.</div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  {activeTableData
                    ? `Changes for ${GROUP_LABELS[activeTableData.type] || activeTableData.type}: ${activeTableData.name}`
                    : 'No object selected in this tab'}
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={copySelectedSql} disabled={!selectedStatements.length}>
                    Copy selected SQL
                  </button>
                  <button type="button" onClick={applySelected} disabled={applying || !selectedStatements.length}>
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
                    : (includeGeneral ? diff.generalStatements || [] : []).filter(
                        (s) => includeDrops || s.type !== 'drop',
                      )
                }
              />
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={routineAcknowledged}
                    onChange={(e) => setRoutineAcknowledged(e.target.checked)}
                    disabled={dryRun}
                  />
                  <span> I understand this will replace existing routines (procedures/triggers)</span>
                </label>
                <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={alterPreviewed}
                    readOnly
                    disabled
                  />
                  <span> I reviewed ALTER statements in the preview</span>
                </label>
                <span style={{ fontSize: '0.85rem', color: '#555' }}>
                  Run a dry-run with ALTER changes to unlock production apply.
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Combined SQL for selected items</strong>
              <span style={{ color: '#666' }}>
                {selectedSql.length} statement{selectedSql.length === 1 ? '' : 's'} ready
              </span>
            </div>
            <div style={{ color: '#555' }}>
              Risk summary — Low: {selectedRiskSummary.low} • Medium: {selectedRiskSummary.medium} • High: {selectedRiskSummary.high}
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
