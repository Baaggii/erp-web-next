import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const DEFAULT_REPORT_PROCS = [
  'dynrep_1_sp_trial_balance_expandable',
  'dynrep_1_sp_income_statement_expandable',
  'dynrep_1_sp_balance_sheet_expandable',
];

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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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
        setMessage('Reports generated successfully. Review results below before closing period.');
      }
    } catch (err) {
      setMessage(String(err?.message || err));
      setPreviewResults([]);
    } finally {
      setPreviewing(false);
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
    <div style={{ padding: 16, maxWidth: 860 }}>
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
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            {previewResults.map((result) => (
              <li key={result.name} style={{ color: result.ok ? '#166534' : '#b91c1c' }}>
                {result.name}: {result.ok ? `OK (${result.rowCount} rows)` : `Failed (${result.error})`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? <p style={{ marginTop: 10 }}>{message}</p> : null}
    </div>
  );
}
