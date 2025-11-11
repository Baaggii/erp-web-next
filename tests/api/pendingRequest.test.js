import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../../api-server/services/pendingRequest.js';
import {
  loadSnapshotArtifactPage,
  deleteSnapshotArtifact,
} from '../../api-server/services/reportSnapshotArtifacts.js';
import * as db from '../../db/index.js';

function setupRequest(overrides = {}) {
  const req = {
    request_id: 1,
    table_name: 't',
    record_id: 1,
    emp_id: 'E1',
    senior_empid: 'S1',
    senior_plan_empid: overrides.senior_plan_empid ?? null,
    request_type: 'edit',
    proposed_data: null,
    ...overrides,
  };
  const employmentRow = {
    employment_senior_empid:
      overrides.employment_senior_empid ?? overrides.senior_empid ?? null,
    employment_senior_plan_empid:
      overrides.employment_senior_plan_empid ??
      overrides.senior_plan_empid ??
      null,
  };
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.includes('FROM pending_request')) {
        return [[req]];
      }
      if (sql.includes('FROM tbl_employment')) {
        return [[employmentRow]];
      }
      return [{}];
    },
    release() {},
  };
  const origGetConn = db.pool.getConnection;
  db.pool.getConnection = async () => conn;
  return {
    conn,
    restore() {
      db.pool.getConnection = origGetConn;
    },
  };
}

await test('direct senior can approve request', async () => {
  const { conn, restore } = setupRequest();
  await service.respondRequest(1, 's1', 'accepted', 'ok');
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'accepted'"));
  assert.ok(upd, 'should update status to accepted');
});

await test('direct senior can decline request', async () => {
  const { conn, restore } = setupRequest();
  await service.respondRequest(1, 's1', 'declined', 'no');
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'declined'"));
  assert.ok(upd, 'should update status to declined');
});

await test('respondRequest returns requester metadata', async () => {
  const { restore } = setupRequest();
  const result = await service.respondRequest(1, 's1', 'accepted', 'yes');
  restore();
  assert.equal(result.requester, 'E1');
  assert.equal(result.status, 'accepted');
  assert.equal(result.requestType, 'edit');
  assert.deepEqual(result.lockedTransactions, []);
});

await test('plan senior can approve report approval request', async () => {
  const { conn, restore } = setupRequest({
    request_type: 'report_approval',
    senior_empid: null,
    employment_senior_plan_empid: 'PS1',
    proposed_data: JSON.stringify({
      procedure: 'demo',
      transactions: [{ table: 'foo', recordId: '1' }],
      parameters: {},
    }),
  });
  await service.respondRequest(1, 'ps1', 'accepted', 'ok');
  restore();
  const auditLog = conn.queries.find((q) =>
    q.sql.startsWith('INSERT INTO user_activity_log') &&
    q.params?.[4] === 'approve_report',
  );
  assert.ok(auditLog, 'should log approve_report action');
});

await test('declining report approval logs decline_report action', async () => {
  const { conn, restore } = setupRequest({
    request_type: 'report_approval',
    senior_empid: null,
    employment_senior_plan_empid: 'PS1',
    proposed_data: JSON.stringify({
      procedure: 'demo',
      transactions: [{ table: 'foo', recordId: '1' }],
      parameters: {},
    }),
  });
  await service.respondRequest(1, 'ps1', 'declined', 'needs work');
  restore();
  const auditLog = conn.queries.find((q) =>
    q.sql.startsWith('INSERT INTO user_activity_log') &&
    q.params?.[4] === 'decline_report',
  );
  assert.ok(auditLog, 'should log decline_report action');
});

await test('listRequests returns report approval metadata', async () => {
  const origQuery = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    return [
      [
        {
          request_id: 1,
          table_name: 'report_transaction_locks',
          record_id: 'demo-1',
          emp_id: 'E1',
          senior_empid: 'S1',
          request_type: 'report_approval',
          proposed_data: JSON.stringify({
            procedure: 'demo_proc',
            parameters: { from: '2024-01-01' },
            transactions: [
              {
                table: 'transactions_sales',
                recordId: 10,
                snapshot: {
                  columns: ['id', 'amount'],
                  rows: [
                    { id: 10, amount: 99.5 },
                    { id: 11, amount: 42 },
                  ],
                  fieldTypeMap: { amount: 'number' },
                },
              },
            ],
            snapshot: {
              columns: ['id', 'amount'],
              rows: [
                { id: 10, amount: 99.5 },
                { id: 11, amount: 42 },
              ],
              fieldTypeMap: { amount: 'number' },
            },
            executed_at: '2024-01-01T00:00:00.000Z',
          }),
          original_data: null,
          created_at_fmt: '2024-01-01 12:00:00',
          responded_at_fmt: null,
          response_empid: null,
        },
      ],
    ];
  };
  const result = await service.listRequests({ request_type: 'report_approval' });
  db.pool.query = origQuery;
  assert.equal(result.rows.length, 1);
  const meta = result.rows[0].report_metadata;
  assert.equal(meta.procedure, 'demo_proc');
  assert.deepEqual(meta.parameters, { from: '2024-01-01' });
  assert.deepEqual(meta.transactions, [
    {
      table: 'transactions_sales',
      tableName: 'transactions_sales',
      recordId: '10',
      record_id: '10',
      snapshot: { id: 10, amount: 99.5 },
      snapshotColumns: ['id', 'amount'],
      columns: ['id', 'amount'],
      snapshotFieldTypeMap: { amount: 'number' },
      fieldTypeMap: { amount: 'number' },
    },
  ]);
  assert.ok(meta.snapshot);
  assert.equal(meta.snapshot.rowCount, 2);
  assert.equal(meta.snapshot.version, 2);
  assert.deepEqual(meta.snapshot.columns, ['id', 'amount']);
  assert.deepEqual(meta.snapshot.rows, [
    { id: 10, amount: 99.5 },
    { id: 11, amount: 42 },
  ]);
  assert.deepEqual(meta.snapshot.fieldTypeMap, { amount: 'number' });
  assert.equal(meta.snapshot.artifact, undefined);
  assert.equal(meta.executed_at, '2024-01-01T00:00:00.000Z');
  assert.equal(meta.requester_empid, 'E1');
  assert.equal(meta.approver_empid, 'S1');
  assert.equal(meta.response_empid, null);
});

await test('sanitizeSnapshot streams large dataset to artifact', async () => {
  const rows = Array.from({ length: 1200 }, (_, idx) => ({ id: idx + 1, value: `row-${idx + 1}` }));
  const snapshot = service.__test__.sanitizeSnapshot({
    rows,
    columns: ['id', 'value'],
    rowCount: rows.length,
    procedure: 'demo_proc',
    params: { foo: 'bar' },
  });
  assert.ok(snapshot.artifact?.id, 'artifact id should be present');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.rowCount, rows.length);
  assert.equal(snapshot.rows.length, 200);
  const page1 = loadSnapshotArtifactPage(snapshot.artifact.id, 1, 500);
  const page3 = loadSnapshotArtifactPage(snapshot.artifact.id, 3, 500);
  assert.equal(page1.rowCount, rows.length);
  assert.equal(page1.rows.length, 500);
  assert.equal(page3.rows.length, 200);
  assert.deepEqual(page1.columns, ['id', 'value']);
  assert.deepEqual(page1.fieldTypeMap, {});
  deleteSnapshotArtifact(snapshot.artifact.id);
});

await test('sanitizeSnapshot converts array rows and total row', async () => {
  const snapshot = service.__test__.sanitizeSnapshot({
    columns: ['id', 'amount'],
    rows: [
      [1, 10],
      [2, 20],
    ],
    totalRow: [null, 30],
  });
  assert.deepEqual(snapshot.columns, ['id', 'amount']);
  assert.deepEqual(snapshot.rows, [
    { id: 1, amount: 10 },
    { id: 2, amount: 20 },
  ]);
  assert.deepEqual(snapshot.totalRow, { id: null, amount: 30 });
});

await test('listRequests normalizes empids in filters', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    return [[]];
  };
  await service.listRequests({ senior_empid: 's1 ', requested_empid: ' e2 ' });
  db.pool.query = origQuery;
  assert.ok(queries[1].sql.includes('UPPER(TRIM(senior_empid))'));
  assert.ok(queries[1].sql.includes('UPPER(TRIM(emp_id))'));
  assert.ok(queries[1].sql.includes('LIMIT ? OFFSET ?'));
  assert.deepEqual(queries[1].params, ['S1', 'E2', 2, 0]);
});

await test('listRequests matches status case-insensitively', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    return [[]];
  };
  await service.listRequests({ status: 'Pending' });
  db.pool.query = origQuery;
  assert.ok(queries[1].sql.includes('LOWER(TRIM(status)) = ?'));
  assert.ok(queries[1].sql.includes('LIMIT ? OFFSET ?'));
  assert.deepEqual(queries[1].params, ['pending', 2, 0]);
});

await test('listRequestsByEmp filters by requester', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    return [[]];
  };
  await service.listRequestsByEmp(' e1 ', { status: 'pending' });
  db.pool.query = origQuery;
  assert.ok(queries[1].sql.includes('UPPER(TRIM(emp_id)) = ?'));
  assert.ok(queries[1].sql.includes('LIMIT ? OFFSET ?'));
  assert.deepEqual(queries[1].params, ['pending', 'E1', 2, 0]);
});

await test('listRequests filters by date range', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    return [[]];
  };
  await service.listRequests({ date_from: '2024-01-01', date_to: '2024-01-31' });
  db.pool.query = origQuery;
  assert.ok(queries[1].sql.includes('DATE(created_at) BETWEEN ? AND ?'));
  assert.ok(queries[1].sql.includes('LIMIT ? OFFSET ?'));
  assert.deepEqual(
    queries[1].params,
    ['2024-01-01', '2024-01-31', 2, 0],
  );
});

await test('listRequests returns requests from entire day when date range is single day', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    return [[{ request_id: 1, created_at: '2024-06-06 23:59:00' }]];
  };
  const result = await service.listRequests({ date_from: '2024-06-06', date_to: '2024-06-06' });
  db.pool.query = origQuery;
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].request_id, 1);
  assert.ok(queries[1].sql.includes('DATE(created_at) BETWEEN ? AND ?'));
  assert.deepEqual(
    queries[1].params,
    ['2024-06-06', '2024-06-06', 2, 0],
  );
});

await test('listRequests returns old requests when no date range specified', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    return [
      [
        {
          request_id: 1,
          proposed_data: null,
          original_data: null,
          created_at_fmt: '2020-01-01 12:00:00',
          responded_at_fmt: null,
        },
      ],
    ];
  };
  const result = await service.listRequests();
  db.pool.query = origQuery;
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].request_id, 1);
  assert.equal(result.rows[0].created_at, '2020-01-01 12:00:00');
  assert.ok(!queries[1].sql.includes('CURDATE()'));
  assert.deepEqual(queries[1].params, [2, 0]);
});

await test(
  "'Today' and 'This Month' filters return same count when data is only from today",
  async () => {
    const origQuery = db.pool.query;
    db.pool.query = async (sql, params) => {
      if (sql.includes('COUNT')) return [[{ count: 1 }]];
      return [
        [
          {
            request_id: 1,
            proposed_data: null,
            original_data: null,
            created_at_fmt: '2024-06-15 10:00:00',
            responded_at_fmt: null,
          },
        ],
      ];
    };
    const today = '2024-06-15';
    const resToday = await service.listRequests({
      date_from: today,
      date_to: today,
    });
    const resMonth = await service.listRequests({
      date_from: '2024-06-01',
      date_to: '2024-06-30',
    });
    db.pool.query = origQuery;
    assert.equal(resToday.total, 1);
    assert.equal(resMonth.total, 1);
    assert.equal(resToday.total, resMonth.total);
  },
);

await test('createRequest throws 409 on duplicate', async () => {
  const conn = {
    async query(sql, params) {
      if (sql.startsWith('SELECT employment_senior_empid')) {
        return [[{ employment_senior_empid: null }]];
      }
      if (sql.startsWith('SELECT request_id, proposed_data FROM pending_request')) {
        return [[{ request_id: 1, proposed_data: JSON.stringify({ a: 1 }) }]];
      }
      return [[]];
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  db.pool.getConnection = async () => conn;
  const origQuery = db.pool.query;
  db.pool.query = async (sql) => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'id' }]];
    return [[]];
  };
  try {
    await assert.rejects(
      service.createRequest({
        tableName: 't',
        recordId: 1,
        empId: 'e1',
        requestType: 'edit',
        proposedData: { a: 1 },
        requestReason: 'test',
      }),
      (err) => err.status === 409,
    );
  } finally {
    db.pool.getConnection = origGet;
    db.pool.query = origQuery;
  }
});

await test('createRequest uses plan senior for report approvals', async () => {
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT')) return [{}];
      if (sql.startsWith('SELECT employment_senior_empid')) {
        return [[
          {
            employment_senior_empid: 'S1',
            employment_senior_plan_empid: 'PS1',
          },
        ]];
      }
      if (sql.startsWith('SELECT request_id, proposed_data FROM pending_request')) {
        return [[]];
      }
      if (sql.startsWith('INSERT INTO pending_request')) {
        return [{ insertId: 10 }];
      }
      return [{}];
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  const origQuery = db.pool.query;
  db.pool.getConnection = async () => conn;
  db.pool.query = async (sql) => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'id' }]];
    return [[]];
  };
  try {
    const payload = {
      procedure: 'demo_proc',
      transactions: [{ table: 'foo', recordId: 1 }],
      parameters: {},
    };
    const result = await service.createRequest({
      tableName: 'foo',
      recordId: 1,
      empId: 'e1',
      requestType: 'report_approval',
      proposedData: payload,
      requestReason: 'demo',
    });
    assert.equal(result.senior_empid, 'PS1');
    assert.equal(result.senior_plan_empid, 'PS1');
    const insert = conn.queries.find((q) =>
      q.sql.startsWith('INSERT INTO pending_request'),
    );
    assert.equal(insert.params[4], 'PS1');
    const auditLog = conn.queries.find((q) =>
      q.sql.startsWith('INSERT INTO user_activity_log'),
    );
    assert.ok(auditLog, 'should insert audit log entry');
    assert.equal(auditLog.params[4], 'request_report_approval');
  } finally {
    db.pool.getConnection = origGet;
    db.pool.query = origQuery;
  }
});

await test('createRequest falls back to legacy senior when plan senior missing', async () => {
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT')) return [{}];
      if (sql.startsWith('SELECT employment_senior_empid')) {
        return [[
          {
            employment_senior_empid: 'S1',
            employment_senior_plan_empid: null,
          },
        ]];
      }
      if (sql.startsWith('SELECT request_id, proposed_data FROM pending_request')) {
        return [[]];
      }
      if (sql.startsWith('INSERT INTO pending_request')) {
        return [{ insertId: 11 }];
      }
      return [{}];
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  const origQuery = db.pool.query;
  db.pool.getConnection = async () => conn;
  db.pool.query = async (sql) => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'id' }]];
    return [[]];
  };
  try {
    const payload = {
      procedure: 'demo_proc',
      transactions: [{ table: 'foo', recordId: 1 }],
      parameters: {},
    };
    const result = await service.createRequest({
      tableName: 'foo',
      recordId: 1,
      empId: 'e1',
      requestType: 'report_approval',
      proposedData: payload,
      requestReason: 'demo',
    });
    assert.equal(result.senior_empid, 'S1');
    assert.equal(result.senior_plan_empid, null);
  } finally {
    db.pool.getConnection = origGet;
    db.pool.query = origQuery;
  }
});

await test('accepted edit requests show original data', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    if (sql.includes('FROM pending_request')) {
      return [
        [
          {
            request_id: 1,
            table_name: 't',
            record_id: 1,
            request_type: 'edit',
            proposed_data: JSON.stringify({ name: 'new' }),
            original_data: JSON.stringify({ name: 'old' }),
            status: 'accepted',
          },
        ],
      ];
    }
    throw new Error('unexpected query');
  };
  const result = await service.listRequests({ status: 'accepted' });
  db.pool.query = origQuery;
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].original, { name: 'old' });
  assert.equal(queries.length, 3);
});

await test('respondRequest succeeds with prior non-pending entries', async () => {
  const rows = [
    {
      request_id: 1,
      table_name: 't',
      record_id: 1,
      emp_id: 'E1',
      senior_empid: 'S1',
      request_type: 'edit',
      status: 'accepted',
      proposed_data: null,
    },
    {
      request_id: 2,
      table_name: 't',
      record_id: 1,
      emp_id: 'E1',
      senior_empid: 'S1',
      request_type: 'edit',
      status: 'pending',
      proposed_data: null,
    },
  ];
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.startsWith('SELECT')) {
        const row = rows.find((r) => r.request_id === params[0]);
        return [[row]];
      }
      if (sql.startsWith("UPDATE pending_request SET status = 'accepted'")) {
        const row = rows.find((r) => r.request_id === params[3]);
        row.status = 'accepted';
        return [{}];
      }
      return [{}];
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  db.pool.getConnection = async () => conn;
  try {
    await service.respondRequest(2, 's1', 'accepted', 'ok');
  } finally {
    db.pool.getConnection = origGet;
  }
  const accepted = rows.filter((r) => r.status === 'accepted');
  assert.equal(accepted.length, 2);
});

await test('second pending request for same record is rejected', async () => {
  const conn = {
    async query(sql, params) {
      if (sql.startsWith('SELECT employment_senior_empid')) {
        return [[{ employment_senior_empid: null }]];
      }
      if (sql.startsWith('SELECT request_id, proposed_data FROM pending_request')) {
        return [[{ request_id: 1, proposed_data: JSON.stringify({ a: 1 }) }]];
      }
      if (sql.startsWith('INSERT INTO pending_request')) {
        const err = new Error('Duplicate entry');
        err.code = 'ER_DUP_ENTRY';
        throw err;
      }
      return [{}];
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  const origQuery = db.pool.query;
  db.pool.getConnection = async () => conn;
  db.pool.query = async (sql) => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'id' }]];
    return [[]];
  };
  try {
    await assert.rejects(
      service.createRequest({
        tableName: 't',
        recordId: 1,
        empId: 'e1',
        requestType: 'edit',
        proposedData: { a: 2 },
        requestReason: 'test',
      }),
      (err) => err.code === 'ER_DUP_ENTRY',
    );
  } finally {
    db.pool.getConnection = origGet;
    db.pool.query = origQuery;
  }
});
