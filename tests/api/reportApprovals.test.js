import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { finalizeReportApprovalRequest, loadReportApprovalArchive } from '../../api-server/services/reportApprovals.js';
import * as db from '../../db/index.js';

const DATA_ROOT = path.join(process.cwd(), 'api-server', 'data');

await test('finalizeReportApprovalRequest writes archive file and metadata', async () => {
  const companyId = 321;
  const requestId = 9876;
  const archiveDir = path.join(
    DATA_ROOT,
    String(companyId),
    'report-approvals',
  );
  await fs.rm(archiveDir, { recursive: true, force: true });
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      return [{}];
    },
  };
  const transactions = [
    { table: 'txn_sales', recordId: '1' },
    { table: 'txn_sales', recordId: '2' },
  ];
  await finalizeReportApprovalRequest(
    {
      companyId,
      requestId,
      procedure: 'demo_proc',
      parameters: { start: '2024-01-01' },
      approvedBy: 'APR1',
      transactions,
      snapshot: {
        version: 2,
        columns: ['id', 'amount'],
        rows: [
          { id: 1, amount: 100 },
          { id: 2, amount: 50 },
        ],
        rowCount: 2,
      },
    },
    conn,
  );
  const filePath = path.join(archiveDir, `${requestId}.json`);
  const exists = await fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
  assert.ok(exists, 'archive file should be created');
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.procedure, 'demo_proc');
  assert.deepEqual(parsed.parameters, { start: '2024-01-01' });
  assert.equal(parsed.requestId, String(requestId));
  assert.equal(parsed.snapshot?.rows?.length, 2);
  const insertQuery = conn.queries.find((q) =>
    typeof q.sql === 'string' && q.sql.includes('INSERT INTO report_approvals'),
  );
  assert.ok(insertQuery, 'should record approval in database');
  assert.ok(
    insertQuery.params.includes('report-approvals/' + `${requestId}.json`),
    'should store relative archive path',
  );
  await fs.rm(archiveDir, { recursive: true, force: true });
});

await test('loadReportApprovalArchive streams file for authorized viewer', async () => {
  const companyId = 654;
  const requestId = 7654;
  const archiveDir = path.join(
    DATA_ROOT,
    String(companyId),
    'report-approvals',
  );
  await fs.mkdir(archiveDir, { recursive: true });
  const filePath = path.join(archiveDir, `${requestId}.json`);
  const payload = { hello: 'world' };
  await fs.writeFile(filePath, JSON.stringify(payload));

  const origQuery = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.includes('FROM pending_request')) {
      return [
        [
          {
            request_id: String(requestId),
            emp_id: 'REQ1',
            response_empid: 'APR1',
            senior_empid: 'APR1',
            senior_plan_empid: null,
            company_id: companyId,
            status: 'accepted',
            request_type: 'report_approval',
          },
        ],
      ];
    }
    if (sql.includes('FROM report_approvals')) {
      return [
        [
          {
            request_id: String(requestId),
            company_id: companyId,
            procedure_name: 'demo_proc',
            parameters_json: '{}',
            approved_by: 'APR1',
            approved_at: '2024-01-01 00:00:00',
            snapshot_file_path: `report-approvals/${requestId}.json`,
            snapshot_file_name: `${requestId}.json`,
            snapshot_file_mime: 'application/json',
            snapshot_file_size: 17,
            snapshot_archived_at: '2024-01-02T00:00:00.000Z',
          },
        ],
      ];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const result = await loadReportApprovalArchive({
      requestId,
      viewerEmpId: 'apr1',
    });
    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    assert.equal(buffer.toString(), JSON.stringify(payload));
    assert.equal(result.mimeType, 'application/json');
    assert.equal(result.fileName, `${requestId}.json`);
    assert.equal(result.byteSize, 17);
  } finally {
    db.pool.query = origQuery;
    await fs.rm(archiveDir, { recursive: true, force: true });
  }
});

await test('loadReportApprovalArchive rejects unauthorized viewers', async () => {
  const origQuery = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.includes('FROM pending_request')) {
      return [
        [
          {
            request_id: '111',
            emp_id: 'REQ1',
            response_empid: 'APR1',
            senior_empid: 'APR1',
            senior_plan_empid: null,
            company_id: 0,
            status: 'accepted',
            request_type: 'report_approval',
          },
        ],
      ];
    }
    if (sql.includes('FROM report_approvals')) {
      return [
        [
          {
            request_id: '111',
            company_id: 0,
            procedure_name: 'demo',
            parameters_json: '{}',
            approved_by: 'APR1',
            approved_at: '2024-01-01',
            snapshot_file_path: 'report-approvals/111.json',
            snapshot_file_name: '111.json',
            snapshot_file_mime: 'application/json',
            snapshot_file_size: 10,
            snapshot_archived_at: '2024-01-02T00:00:00.000Z',
          },
        ],
      ];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    await assert.rejects(
      loadReportApprovalArchive({ requestId: '111', viewerEmpId: 'OTHER' }),
      (err) => {
        assert.equal(err?.status, 403);
        return true;
      },
    );
  } finally {
    db.pool.query = origQuery;
  }
});
