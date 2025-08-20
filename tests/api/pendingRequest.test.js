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
  await service.respondRequest(1, 'S1', 'accepted', null);
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'accepted'"));
  assert.ok(upd, 'should update status to accepted');
});

await test('direct senior can decline request', async () => {
  const { conn, restore } = setupRequest();
  await service.respondRequest(1, 'S1', 'declined', null);
  restore();
  const upd = conn.queries.find((q) => q.sql.includes("status = 'declined'"));
  assert.ok(upd, 'should update status to declined');
});
