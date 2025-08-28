import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

await test('listModules filters by license and permission', async () => {
  const controller = await import('../../api-server/controllers/moduleController.js?test=listModulesPerm');
  const origQuery = db.pool.query;
  const queries = [];
  db.pool.query = async (sql, params) => {
    queries.push({ sql, params });
    const modules = [
      { module_key: 'sales', label: 'Sales', parent_key: null, show_in_sidebar: 1, show_in_header: 0 },
      { module_key: 'hr', label: 'HR', parent_key: null, show_in_sidebar: 1, show_in_header: 0 },
    ];
    // Only "sales" is both licensed and permitted
    const licensed = new Set(['sales', 'hr']);
    const permitted = new Set(['sales']);
    const rows = modules.filter(
      (m) => licensed.has(m.module_key) && permitted.has(m.module_key),
    );
    return [rows];
  };

  const req = { user: { userLevel: 2, companyId: 1 } };
  const res = { body: undefined, json(data) { this.body = data; } };
  await controller.listModules(req, res, () => {});
  db.pool.query = origQuery;

  assert.deepEqual(res.body.map((m) => m.module_key), ['sales']);
  assert.deepEqual(queries[0].params, [1, 2, 1]);
  assert.ok(/company_module_licenses/.test(queries[0].sql));
  assert.ok(/user_level_permissions/.test(queries[0].sql));
});
