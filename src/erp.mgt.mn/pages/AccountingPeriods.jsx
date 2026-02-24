import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_REPORT_PROCS = [
  'dynrep_1_sp_trial_balance_expandable',
  'dynrep_1_sp_income_statement_expandable',
  'dynrep_1_sp_balance_sheet_expandable',
];

export default function AccountingPeriodsPage() {
  const { user, session, company } = useAuth();
  const companyId = Number(user?.companyId || user?.company_id || session?.company_id || company?.id || company || 0);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState('');
  const [reportProcedures, setReportProcedures] = useState(DEFAULT_REPORT_PROCS.join(', '));

  const parseApiResponse = async (res) => {
    const text = await res.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status}). Received non-JSON response.`);
      }
      throw new Error('Server returned a non-JSON response.');
    }

    if (!res.ok || !payload?.ok) {
      throw new Error(payload?.message || `Request failed (${res.status})`);
    }

    return payload;
  };

  const loadStatus = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(
        `${API_BASE}/period-control/status?company_id=${companyId}&fiscal_year=${fiscalYear}`,
        { credentials: 'include' },
      );
      const json = await parseApiResponse(res);
      setPeriod(json?.period || null);
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

  const handleClosePeriod = async () => {
    const ok = window.confirm(
      `Close fiscal year ${fiscalYear}? This action finalizes balances and creates opening balances for ${fiscalYear + 1}.`,
    );
    if (!ok) return;

    setClosing(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/period-control/close`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          fiscal_year: fiscalYear,
          report_procedures: parsedProcedures,
        }),
      });
      const json = await parseApiResponse(res);
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label htmlFor="fiscal-year">Fiscal Year</label>
        <input id="fiscal-year" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value || 0))} />
        <button type="button" onClick={loadStatus} disabled={loading || closing}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div><strong>Status:</strong> {Number(period?.is_closed) ? 'Closed' : 'Open'}</div>
        <div><strong>Range:</strong> {period?.period_from || '-'} ~ {period?.period_to || '-'}</div>
        <div><strong>Closed At:</strong> {period?.closed_at || '-'}</div>
        <div><strong>Closed By:</strong> {period?.closed_by || '-'}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="report-procedures">Report procedures to execute after closing (comma-separated)</label>
        <textarea
          id="report-procedures"
          rows={3}
          value={reportProcedures}
          onChange={(e) => setReportProcedures(e.target.value)}
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>

      <button type="button" disabled={closing || Number(period?.is_closed) === 1} onClick={handleClosePeriod}>
        {closing ? 'Closing period…' : 'Close Period'}
      </button>

      {message ? <p style={{ marginTop: 10 }}>{message}</p> : null}
    </div>
  );
}
