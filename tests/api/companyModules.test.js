import test from 'node:test';
import assert from 'node:assert/strict';
import { listLicenses } from '../../api-server/controllers/companyModuleController.js';
import * as db from '../../db/index.js';

function createRes() {
  return {
    body: undefined,
    status() { return this; },
    json(b) { this.body = b; },
    sendStatus() {},
  };
}

function mockPool() {
  const orig = db.pool.query;
  db.pool.query = async (sql, params) => {
    if (/WHERE/.test(sql)) {
      assert.match(sql, /c\.id = \?/);
      assert.match(sql, /c\.created_by = \?/);
      assert.deepEqual(params, [0, 1]);
      return [[
        {
          company_id: 0,
          company_name: 'Global',
          module_key: 'mod',
          label: 'Mod',
          licensed: 1,
        },
      ]];
    }
    return [[
      { company_id: 0, company_name: 'Global', module_key: 'mod', label: 'Mod', licensed: 1 },
      { company_id: 1, company_name: 'Other', module_key: 'mod', label: 'Mod', licensed: 1 },
    ]];
  };
  return () => { db.pool.query = orig; };
}

test('GET /api/company_modules?companyId=0 returns only global tenant licenses', async () => {
  const restore = mockPool();
  const req = { query: { companyId: 0 }, user: { empid: 1 } };
  const res = createRes();
  await listLicenses(req, res, () => {});
  restore();
  assert.deepEqual(res.body, [
    { company_id: 0, company_name: 'Global', module_key: 'mod', label: 'Mod', licensed: 1 },
  ]);
});
