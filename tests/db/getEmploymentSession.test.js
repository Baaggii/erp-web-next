import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

test('getEmploymentSession populates system_settings permission', async () => {
  const orig = db.pool.query;
  db.pool.query = async () => [[{
    company_id: 1,
    company_name: 'Comp',
    branch_id: 1,
    branch_name: 'Branch',
    department_id: 1,
    department_name: 'Dept',
    position_id: 1,
    senior_empid: null,
    employee_name: 'Emp',
    user_level: 1,
    user_level_name: 'Admin',
    permission_list: 'system_settings',
  }]];
  const session = await db.getEmploymentSession(1, 1);
  db.pool.query = orig;
  assert.equal(session.permissions.system_settings, true);
});

