import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../../api-server/services/pendingRequest.js';
import * as db from '../../db/index.js';

function setupRequest(overrides = {}) {
  const req = {
    request_id: 1,
    table_name: 't',
    record_id: 1,
    emp_id: 'E1',
    senior_empid: 'S1',
    request_type: 'edit',
    proposed_data: null,
    ...overrides,
  };
  const conn = {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (sql.startsWith('SELECT')) {
        return [[req]];
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
      if (sql.startsWith('SELECT employment_senior_empid, employment_senior_plan_empid')) {
        return [[{ employment_senior_empid: null, employment_senior_plan_empid: null }]];
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
  const notifications = [];
  const lockQueries = [];
  const conn = {
    async query(sql, params) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return [{}];
      }
      if (sql.startsWith('SELECT employment_senior_empid, employment_senior_plan_empid')) {
        return [[{ employment_senior_empid: 'SENIOR1', employment_senior_plan_empid: 'plan123' }]];
      }
      if (sql.startsWith('SELECT request_id, proposed_data FROM pending_request')) {
        return [[]];
      }
      if (sql.startsWith('INSERT INTO pending_request')) {
        return [{ insertId: 42 }];
      }
      if (sql.startsWith('INSERT INTO user_activity_log')) {
        return [{}];
      }
      if (sql.startsWith('INSERT INTO notifications')) {
        notifications.push({ sql, params });
        return [{}];
      }
      if (
        sql.startsWith('DELETE FROM report_transaction_locks') ||
        sql.startsWith('INSERT INTO report_transaction_locks')
      ) {
        lockQueries.push({ sql, params });
        return [{}];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() {},
  };
  const origGet = db.pool.getConnection;
  const origQuery = db.pool.query;
  db.pool.getConnection = async () => conn;
  db.pool.query = async (sql, params) => {
    if (sql.includes('information_schema')) return [[{ COLUMN_NAME: 'id' }]];
    return [[]];
  };
  try {
    const result = await service.createRequest({
      tableName: 'tbl_requests',
      recordId: 5,
      empId: 'emp5',
      requestType: 'report_approval',
      proposedData: {
        procedure: 'sp_test',
        parameters: { a: 1 },
        transactions: [{ table: 'tbl_requests', recordId: '5' }],
      },
      requestReason: 'Need approval',
    });
    assert.equal(result.senior_empid, 'PLAN123');
    assert.equal(result.request_id, 42);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].params[1], 'PLAN123');
    assert.ok(lockQueries.length >= 1);
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
  assert.equal(queries.length, 2);
});

await test('listRequests supports grouped request types', async () => {
  const origQuery = db.pool.query;
  const captured = [];
  db.pool.query = async (sql, params) => {
    captured.push({ sql, params });
    if (sql.includes('COUNT')) return [[{ count: 0 }]];
    if (sql.includes('FROM pending_request')) return [[]];
    throw new Error('unexpected query');
  };
  try {
    await service.listRequests({ request_type: 'changes' });
  } finally {
    db.pool.query = origQuery;
  }
  const whereClause = captured.find(({ sql }) => sql.includes('FROM pending_request'))?.sql;
  assert.ok(whereClause?.includes('IN (?, ?)'));
  const params = captured.find(({ sql }) => sql.includes('FROM pending_request'))?.params || [];
  assert.deepEqual(params.slice(0, 2).sort(), ['delete', 'edit']);
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
        const row = rows.find((r) => r.request_id === params[4]);
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
      if (sql.startsWith('SELECT employment_senior_empid, employment_senior_plan_empid')) {
        return [[{ employment_senior_empid: null, employment_senior_plan_empid: null }]];
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
