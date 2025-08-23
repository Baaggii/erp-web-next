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
  await service.respondRequest(1, 's1', 'accepted', null);
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'accepted'"));
  assert.ok(upd, 'should update status to accepted');
});

await test('direct senior can decline request', async () => {
  const { conn, restore } = setupRequest();
  await service.respondRequest(1, 's1', 'declined', null);
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'declined'"));
  assert.ok(upd, 'should update status to declined');
});

await test('respondRequest returns requester and status', async () => {
  const { restore } = setupRequest();
  const result = await service.respondRequest(1, 's1', 'accepted', null);
  restore();
  assert.deepEqual(result, { requester: 'E1', status: 'accepted' });
});

await test('getSeenCounts returns zeros when no row', async () => {
  const origQuery = db.pool.query;
  db.pool.query = async () => [[]];
  const counts = await service.getSeenCounts('E1');
  db.pool.query = origQuery;
  assert.deepEqual(counts, {
    incoming: { pending: 0, accepted: 0, declined: 0 },
    outgoing: { accepted: 0, declined: 0 },
  });
});

await test('markSeenCounts upserts counts', async () => {
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    return [{}];
  };
  await service.markSeenCounts('E1', {
    incoming: { pending: 1, accepted: 2, declined: 3 },
    outgoing: { accepted: 4, declined: 5 },
  });
  db.pool.query = origQuery;
  const insert = queries.find((q) =>
    q.sql.includes('INSERT INTO request_seen_counts'),
  );
  assert.ok(insert, 'should insert into request_seen_counts');
  assert.deepEqual(insert.params.slice(0, 6), [1, 2, 3, 4, 5, 'E1']);
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
  assert.ok(queries[0].sql.includes('UPPER(TRIM(senior_empid))'));
  assert.ok(queries[0].sql.includes('UPPER(TRIM(emp_id))'));
  assert.deepEqual(queries[0].params, ['S1', 'E2']);
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
  assert.ok(queries[0].sql.includes('LOWER(TRIM(status)) = ?'));
  assert.deepEqual(queries[0].params, ['pending']);
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
  assert.ok(queries[0].sql.includes('UPPER(TRIM(emp_id)) = ?'));
  assert.deepEqual(queries[0].params, ['pending', 'E1']);
});
