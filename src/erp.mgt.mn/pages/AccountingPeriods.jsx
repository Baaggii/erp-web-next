import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const DEFAULT_REPORT_PROCS = [
  'dynrep_1_sp_trial_balance_expandable',
  'dynrep_1_sp_income_statement_expandable',
  'dynrep_1_sp_balance_sheet_expandable',
];

function renderCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AccountingPeriodsPage() {
  const { user, session, company, permissions } = useAuth();
  const companyId = Number(user?.companyId || user?.company_id || session?.company_id || company?.id || company || 0);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResults, setPreviewResults] = useState([]);
  const [message, setMessage] = useState('');
  const [reportProcedures, setReportProcedures] = useState(DEFAULT_REPORT_PROCS.join(', '));
  const [savingSnapshots, setSavingSnapshots] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [loadingSnapshotId, setLoadingSnapshotId] = useState(null);

  const canClosePeriod = Boolean(
    permissions?.['period.close'] ||
    permissions?.finance_period_close ||
    permissions?.system_settings ||
    session?.permissions?.['period.close'] ||
    session?.permissions?.finance_period_close ||
    session?.permissions?.system_settings,
  );

  const loadStatus = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/period-control/status?company_id=${companyId}&fiscal_year=${fiscalYear}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load period');
      setPeriod(json.period);
    } catch (err) {
      setMessage(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [companyId, fiscalYear]);

  const loadSnapshots = useCallback(async () => {
    if (!companyId) return;
    setLoadingSnapshots(true);
    try {
      const res = await fetch(`/api/period-control/snapshots?company_id=${companyId}&fiscal_year=${fiscalYear}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load snapshots');
      setSnapshots(Array.isArray(json.snapshots) ? json.snapshots : []);
    } catch (err) {
      setMessage(String(err?.message || err));
    } finally {
      setLoadingSnapshots(false);
    }
  }, [companyId, fiscalYear]);

  useEffect(() => {
    loadStatus();
    loadSnapshots();
  }, [loadStatus, loadSnapshots]);

  const parsedProcedures = useMemo(
    () => reportProcedures.split(',').map((value) => value.trim()).filter(Boolean),
    [reportProcedures],
  );

  const handlePreviewReports = async () => {
    if (!companyId || parsedProcedures.length === 0) return;
    setPreviewing(true);
    setMessage('');
    try {
      const res = await fetch('/api/period-control/preview', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          fiscal_year: fiscalYear,
          report_procedures: parsedProcedures,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to preview reports');
      const results = Array.isArray(json.results) ? json.results : [];
      setPreviewResults(results);
      if (results.some((item) => !item.ok)) {
        setMessage('Some reports failed. Review errors before closing period.');
      } else {
        setMessage('Reports generated successfully. Review full results below and save snapshots if needed.');
      }
    } catch (err) {
      setMessage(String(err?.message || err));
      setPreviewResults([]);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSaveSnapshot = async (result) => {
    const name = result?.name;
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    if (!name || !rows.length || !companyId) return;
    setSavingSnapshots((prev) => ({ ...prev, [name]: true }));
    setMessage('');
    try {
      const res = await fetch('/api/period-control/snapshot', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          fiscal_year: fiscalYear,
          procedure_name: name,
          rows,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to save snapshot');
      setMessage(`Snapshot saved for ${name}.`);
      await loadSnapshots();
    } catch (err) {
      setMessage(String(err?.message || err));
    } finally {
      setSavingSnapshots((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleOpenSnapshot = async (snapshotId) => {
    if (!snapshotId || !companyId) return;
    setLoadingSnapshotId(snapshotId);
    setMessage('');
    try {
      const res = await fetch(`/api/period-control/snapshots/${snapshotId}?company_id=${companyId}&page=1&per_page=500`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to load snapshot');
      setSelectedSnapshot(json.snapshot || null);
    } catch (err) {
      setMessage(String(err?.message || err));
    } finally {
      setLoadingSnapshotId(null);
    }
  };

  const handleClosePeriod = async () => {
    const hasSuccessfulPreview = previewResults.some((result) => result.ok);
    if (!hasSuccessfulPreview) {
      setMessage('Please run report preview before closing the fiscal period.');
      return;
    }

    const ok = window.confirm(
      `Close fiscal year ${fiscalYear}? This action finalizes balances and creates opening balances for ${fiscalYear + 1}.`,
    );
    if (!ok) return;

    setClosing(true);
    setMessage('');
    try {
      const res = await fetch('/api/period-control/close', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          fiscal_year: fiscalYear,
          report_procedures: parsedProcedures,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.message || 'Failed to close period');
      setMessage(`Period closed. Opening journal #${json.openingJournalId || 'N/A'} created for ${json.nextFiscalYear}.`);
      await loadStatus();
    } catch (err) {
      setMessage(String(err?.message || err));
    } finally {
      setClosing(false);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2>Accounting Periods</h2>
      {!canClosePeriod ? <p style={{ color: '#b45309' }}>You do not have permission to close accounting periods.</p> : null}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label htmlFor="fiscal-year">Fiscal Year</label>
        <input id="fiscal-year" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value || 0))} />
        <button type="button" onClick={loadStatus} disabled={loading || closing || previewing}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div><strong>Status:</strong> {Number(period?.is_closed) ? 'Closed' : 'Open'}</div>
        <div><strong>Range:</strong> {period?.period_from || '-'} ~ {period?.period_to || '-'}</div>
        <div><strong>Closed At:</strong> {period?.closed_at || '-'}</div>
        <div><strong>Closed By:</strong> {period?.closed_by || '-'}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="report-procedures">Reports to review before closing (comma-separated procedure names)</label>
        <textarea
          id="report-procedures"
          rows={3}
          value={reportProcedures}
          onChange={(e) => setReportProcedures(e.target.value)}
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button type="button" onClick={handlePreviewReports} disabled={!canClosePeriod || previewing || parsedProcedures.length === 0 || Number(period?.is_closed) === 1}>
          {previewing ? 'Generating reports…' : 'Show Reports'}
        </button>
        <button type="button" disabled={!canClosePeriod || closing || Number(period?.is_closed) === 1} onClick={handleClosePeriod}>
          {closing ? 'Closing period…' : 'Close Period'}
        </button>
      </div>

      {previewResults.length > 0 ? (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 10 }}>
          <strong>Report preview</strong>
          {previewResults.map((result) => {
            const rows = Array.isArray(result.rows) ? result.rows : [];
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            return (
              <div key={result.name} style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                <div style={{ color: result.ok ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                  {result.name}: {result.ok ? `OK (${result.rowCount} rows)` : `Failed (${result.error})`}
                </div>
                {result.ok ? (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleSaveSnapshot(result)}
                      disabled={savingSnapshots[result.name] || rows.length === 0}
                      style={{ marginBottom: 8 }}
                    >
                      {savingSnapshots[result.name] ? 'Saving snapshot…' : 'Save Snapshot'}
                    </button>
                    {rows.length > 0 ? (
                      <div style={{ overflowX: 'auto', maxHeight: 260, border: '1px solid #eee' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              {columns.map((col) => (
                                <th key={col} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 100).map((row, idx) => (
                              <tr key={`${result.name}-${idx}`}>
                                {columns.map((col) => (
                                  <td key={`${result.name}-${idx}-${col}`} style={{ borderBottom: '1px solid #f0f0f0', padding: 6 }}>
                                    {renderCell(row[col])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p style={{ margin: 0 }}>No rows returned.</p>}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 14 }}>
        <strong>Saved report snapshots</strong>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <button type="button" onClick={loadSnapshots} disabled={loadingSnapshots}>{loadingSnapshots ? 'Refreshing…' : 'Refresh Snapshots'}</button>
        </div>
        {snapshots.length === 0 ? <p style={{ margin: 0 }}>No snapshots saved for this fiscal year yet.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {snapshots.map((snapshot) => (
              <li key={snapshot.snapshot_id} style={{ marginBottom: 6 }}>
                <strong>{snapshot.procedure_name}</strong> — {snapshot.row_count} rows — {snapshot.created_at || ''}
                <button
                  type="button"
                  onClick={() => handleOpenSnapshot(snapshot.snapshot_id)}
                  disabled={loadingSnapshotId === snapshot.snapshot_id}
                  style={{ marginLeft: 8 }}
                >
                  {loadingSnapshotId === snapshot.snapshot_id ? 'Opening…' : 'View'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedSnapshot?.artifact ? (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 14 }}>
          <strong>Snapshot view: {selectedSnapshot.procedure_name}</strong>
          <div style={{ marginTop: 6, marginBottom: 6 }}>Rows: {selectedSnapshot.artifact.rowCount}</div>
          <div style={{ overflowX: 'auto', maxHeight: 340, border: '1px solid #eee' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {(selectedSnapshot.artifact.columns || []).map((col) => (
                    <th key={col} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(selectedSnapshot.artifact.rows || []).map((row, idx) => (
                  <tr key={`snap-${selectedSnapshot.snapshot_id}-${idx}`}>
                    {(selectedSnapshot.artifact.columns || []).map((col) => (
                      <td key={`snap-${selectedSnapshot.snapshot_id}-${idx}-${col}`} style={{ borderBottom: '1px solid #f0f0f0', padding: 6 }}>
                        {renderCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {message ? <p style={{ marginTop: 10 }}>{message}</p> : null}
    </div>
  );
}
