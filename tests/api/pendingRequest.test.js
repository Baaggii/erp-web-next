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

await test('respondRequest returns requester and status', async () => {
  const { restore } = setupRequest();
  const result = await service.respondRequest(1, 's1', 'accepted', 'yes');
  restore();
  assert.deepEqual(result, { requester: 'E1', status: 'accepted' });
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
  assert.ok(queries[1].sql.includes('created_at >= ?'));
  assert.ok(queries[1].sql.includes('created_at <= ?'));
  assert.ok(queries[1].sql.includes('LIMIT ? OFFSET ?'));
  assert.deepEqual(
    queries[1].params,
    ['2024-01-01 00:00:00', '2024-01-31 23:59:59', 2, 0],
  );
});

await test('listRequests covers entire day when date_from and date_to match', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT')) return [[{ count: 1 }]];
    return [[{ request_id: 1, created_at: '2024-06-06 12:00:00' }]];
  };
  const result = await service.listRequests({ date_from: '2024-06-06', date_to: '2024-06-06' });
  db.pool.query = origQuery;
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].request_id, 1);
  assert.deepEqual(
    queries[1].params,
    ['2024-06-06 00:00:00', '2024-06-06 23:59:59', 2, 0],
  );
});

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
