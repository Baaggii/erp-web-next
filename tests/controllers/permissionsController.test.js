import test from 'node:test';
import assert from 'node:assert/strict';
import { updateActions } from '../../api-server/controllers/permissionsController.js';
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

test('updateActions allows modifying level 1', async () => {
  const req = {
    params: { userLevelId: '1' },
    body: { modules: ['m1'], buttons: [], functions: [], api: [], permissions: [] },
  };
  const res = createRes();
  const original = db.pool.query;
  let calls = 0;
  db.pool.query = async (...args) => { calls++; return [[],[]]; };
  await updateActions(req, res, () => {});
  assert.equal(res.code, 200);
  assert(calls > 0);
  db.pool.query = original;
});
