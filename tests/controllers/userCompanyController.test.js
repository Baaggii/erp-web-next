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
  let capturedParams;
  const mock = t.mock.method(db.pool, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT id, name')) {
      return [[{ id: 2, created_by: 1 }]];
    }
    capturedParams = params;
    return [[{ id: 1 }]];
  });
  await listAssignments(req, res, () => {});
  assert.equal(capturedParams[0], 2);
  assert.equal(capturedParams[1], 1);
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

test('listAssignments rejects when company not created by acting admin', async (t) => {
  const req = { query: {}, user: { empid: 1, companyId: 2 } };
  const res = createRes();
  const mock = t.mock.method(db.pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT id, name')) {
      return [[{ id: 3, created_by: 1 }]];
    }
    throw new Error('should not query assignments');
  });
  await listAssignments(req, res, () => {});
  assert.equal(res.code, 403);
  mock.mock.restore();
});
