import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';

function mockQueries(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = orig;
  };
}

test('getEmploymentSession populates system_settings permission', async () => {
  const restore = mockQueries(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.includes('table_column_labels')) return [[]];
    return [[{
      company_id: 1,
      company_name: 'Comp',
      branch_id: 1,
      branch_name: 'Branch',
      department_id: 1,
      department_name: 'Dept',
      position_id: 1,
      senior_empid: null,
      senior_plan_empid: null,
      employee_name: 'Emp',
      user_level: 1,
      user_level_name: 'Admin',
      permission_list: 'system_settings',
    }]];
  });
  const session = await db.getEmploymentSession(1, 1);
  restore();
  assert.equal(session.permissions.system_settings, true);
});

test('getEmploymentSession accepts companyId=0', async () => {
  const restore = mockQueries(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.includes('table_column_labels')) return [[]];
    return [[{
      company_id: 0,
      company_name: 'Comp',
      branch_id: 1,
      branch_name: 'Branch',
      department_id: 1,
      department_name: 'Dept',
      position_id: 1,
      senior_empid: null,
      senior_plan_empid: null,
      employee_name: 'Emp',
      user_level: 1,
      user_level_name: 'Admin',
      permission_list: 'system_settings',
    }]];
  });
  const session = await db.getEmploymentSession(1, 0);
  restore();
  assert.equal(session.permissions.system_settings, true);
});

test('getEmploymentSession joins branch and department with company scope', async () => {
  let capturedSql = '';
  const restore = mockQueries(async (sql) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.includes('table_column_labels')) return [[]];
    capturedSql = sql;
    return [[{
      company_id: 1,
      company_name: 'Comp',
      branch_id: 1,
      branch_name: 'Branch',
      department_id: 1,
      department_name: 'Dept',
      position_id: 1,
      senior_empid: null,
      senior_plan_empid: null,
      employee_name: 'Emp',
      user_level: 1,
      user_level_name: 'Admin',
      permission_list: 'system_settings',
    }]];
  });
  await db.getEmploymentSession(1, 1);
  restore();
  assert.match(
    capturedSql,
    /LEFT JOIN code_branches b ON e\.employment_branch_id = b\.branch_id AND b\.company_id = e\.employment_company_id/,
  );
  assert.match(
    capturedSql,
    /LEFT JOIN code_department d ON e\.employment_department_id = d\.\w+ AND d\.company_id IN \(0, e\.employment_company_id\)/,
  );
});

test('getEmploymentSession prioritizes matching branch and department when provided', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const restore = mockQueries(async (sql, params) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (sql.includes('table_column_labels')) return [[]];
    capturedSql = sql;
    capturedParams = params || [];
    return [[{
      company_id: 1,
      company_name: 'Comp',
      branch_id: 2,
      branch_name: 'Branch',
      department_id: 3,
      department_name: 'Dept',
      position_id: 1,
      senior_empid: null,
      senior_plan_empid: null,
      employee_name: 'Emp',
      user_level: 1,
      user_level_name: 'Admin',
      permission_list: 'system_settings',
    }]];
  });
  await db.getEmploymentSession(1, 1, { branchId: 2, departmentId: 3 });
  restore();
  assert.match(
    capturedSql,
    /CASE WHEN e\.employment_branch_id <=> \? THEN 0 ELSE 1 END/,
  );
  assert.match(
    capturedSql,
    /CASE WHEN e\.employment_department_id <=> \? THEN 0 ELSE 1 END/,
  );
  assert.equal(capturedParams[0], 1);
  assert.equal(capturedParams[1], 1);
  assert.equal(capturedParams[2], 2);
  assert.equal(capturedParams[3], 3);
});

