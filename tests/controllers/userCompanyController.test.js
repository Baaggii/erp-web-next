import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import { listAssignments } from '../../api-server/controllers/userCompanyController.js';

function createRes() {
  return {
    code: undefined,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    sendStatus(c) { this.code = c; },
  };
}

test('listAssignments defaults companyId to req.user.companyId', async (t) => {
  const req = { query: {}, user: { empid: 1, companyId: 2 } };
  const res = createRes();
  let captured;
  const mock = t.mock.method(db.pool, 'query', async (sql, params) => {
    captured = params[0];
    return [[{ id: 1 }]];
  });
  await listAssignments(req, res, () => {});
  assert.equal(captured, 2);
  assert.deepEqual(res.body, [{ id: 1 }]);
  mock.mock.restore();
});

test('listAssignments rejects cross-tenant requests without permission', async (t) => {
  const req = { query: { companyId: 3 }, user: { empid: 1, companyId: 2 } };
  const res = createRes();
  let calls = 0;
  const mock = t.mock.method(db.pool, 'query', async () => {
    calls += 1;
    return [[]];
  });
  await listAssignments(req, res, () => {});
  assert.equal(res.code, 403);
  assert.equal(calls, 1);
  mock.mock.restore();
});
