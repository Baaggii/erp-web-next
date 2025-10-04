import test from 'node:test';
import assert from 'node:assert/strict';
import { listUsers } from '../../api-server/controllers/userController.js';
import * as db from '../../db/index.js';

function createRes() {
  return {
    code: undefined,
    body: undefined,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
    sendStatus(c) {
      this.code = c;
      return this;
    },
  };
}

test('listUsers defaults to req.user.companyId and returns users', async (t) => {
  const req = { query: {}, user: { empid: 1, companyId: 2 } };
  const res = createRes();
  let call = 0;
  const queryMock = t.mock.method(db.pool, 'query', async (...args) => {
    call++;
    if (call === 1) {
      return [[{
        company_id: 2,
        branch_id: 0,
        department_id: 0,
        position_id: 0,
        senior_empid: 0,
        senior_plan_empid: 0,
        permission_list: '',
      }]];
    }
    return [[{ id: 1 }]];
  });
  await listUsers(req, res, () => {});
  assert.equal(queryMock.mock.calls[1].arguments[1][0], 2);
  assert.deepEqual(res.body, [{ id: 1 }]);
});

test('listUsers returns 403 when user lacks access to company', async (t) => {
  const req = { query: { companyId: 3 }, user: { empid: 1, companyId: 2 } };
  const res = createRes();
  t.mock.method(db.pool, 'query', async () => [[]]);
  await listUsers(req, res, () => {});
  assert.equal(res.code, 403);
});

