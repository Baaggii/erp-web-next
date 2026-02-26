import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';

import { createPeriodControlRouter } from '../../api-server/routes/period_control.js';

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/period-control', router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (req, _res, next) => {
  req.user = { companyId: 1, empid: 'tester' };
  next();
};

test('GET /status returns period details', async () => {
  const router = createPeriodControlRouter({
    requireAuth: auth,
    getPeriodStatus: async () => ({ fiscal_year: 2025, is_closed: 0 }),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/period-control/status?company_id=1&fiscal_year=2025`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.period.fiscal_year, 2025);
  });
});

test('POST /close validates payload and closes period', async () => {
  const router = createPeriodControlRouter({
    requireAuth: auth,
    requirePeriodClosePermission: async () => ({ allowed: true }),
    closeFiscalPeriod: async () => ({ ok: true, nextFiscalYear: 2026, openingJournalId: 99 }),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/period-control/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: 1, fiscal_year: 2025, report_procedures: ['dynrep_1_sp_trial_balance_expandable'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, nextFiscalYear: 2026, openingJournalId: 99 });

    const invalid = await fetch(`${baseUrl}/api/period-control/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: 1, fiscal_year: 2025, report_procedures: [] }),
    });
    assert.equal(invalid.status, 400);
  });
});


test('POST /preview validates payload and returns preview results', async () => {
  const router = createPeriodControlRouter({
    requireAuth: auth,
    requirePeriodClosePermission: async () => ({ allowed: true }),
    previewFiscalPeriodReports: async () => ([{ name: 'dynrep_1_sp_trial_balance_expandable', ok: true, rowCount: 2 }]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/period-control/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: 1, fiscal_year: 2025, report_procedures: ['dynrep_1_sp_trial_balance_expandable'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.results[0].ok, true);

    const invalid = await fetch(`${baseUrl}/api/period-control/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: 1, fiscal_year: 2025, report_procedures: [] }),
    });
    assert.equal(invalid.status, 400);
  });
});


test('DELETE /snapshots/:snapshotId validates and deletes snapshot', async () => {
  const router = createPeriodControlRouter({
    requireAuth: auth,
    requirePeriodClosePermission: async () => ({ allowed: true }),
    deleteFiscalPeriodReportSnapshot: async ({ snapshotId }) => ({ deleted: snapshotId === 5 }),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/period-control/snapshots/5?company_id=1`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });

    const missing = await fetch(`${baseUrl}/api/period-control/snapshots/7?company_id=1`, {
      method: 'DELETE',
    });
    assert.equal(missing.status, 404);

    const invalid = await fetch(`${baseUrl}/api/period-control/snapshots/not-a-number?company_id=1`, {
      method: 'DELETE',
    });
    assert.equal(invalid.status, 400);
  });
});
