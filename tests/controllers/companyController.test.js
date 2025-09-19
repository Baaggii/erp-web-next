import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import {
  createCompanyHandler,
  deleteCompanyHandler,
  listCompanyBackupsHandler,
  restoreCompanyBackupHandler,
} from '../../api-server/controllers/companyController.js';
import { seedCompany } from '../../api-server/controllers/tenantTablesController.js';
import * as db from '../../db/index.js';

function mockPoolSequential(responses = []) {
  const orig = db.pool.query;
  let i = 0;
  db.pool.query = async (...args) => {
    const res = responses[i];
    i += 1;
    if (typeof res === 'function') return res(...args);
    return res;
  };
  return () => {
    db.pool.query = orig;
  };
}

function mockPool(handler) {
  const originalQuery = db.pool.query;
  const originalGet = db.pool.getConnection;
  db.pool.query = handler;
  db.pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: handler,
  });
  return () => {
    db.pool.query = originalQuery;
    db.pool.getConnection = originalGet;
  };
}

function createRes() {
  return {
    code: undefined,
    body: undefined,
    locals: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    sendStatus(c) { this.code = c; },
  };
}

test('createCompanyHandler allows system admin with companyId=0', async () => {
  let capturedCompanyId;
  const restore = mockPoolSequential([
    (sql, params) => {
      capturedCompanyId = params[1];
      return [[{
        company_id: 0,
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
    },
    [[
      { COLUMN_NAME: 'name' },
      { COLUMN_NAME: 'Gov_Registration_number' },
      { COLUMN_NAME: 'Address' },
      { COLUMN_NAME: 'Telephone' },
      { COLUMN_NAME: 'created_by' }
    ]],
    [{ insertId: 5 }],
    [[]],
    [[]],
  ]);
  const req = {
    body: {
      name: 'NewCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555'
    },
    user: { empid: 1, companyId: 0 }
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  restore();
  assert.equal(capturedCompanyId, 0);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 5 });
});

test('createCompanyHandler forwards seedRecords and overwrite', async () => {
  const orig = db.pool.query;
  const inserts = [];
  let deleteCalled = false;
  db.pool.query = async (sql, params) => {
    if (/information_schema\.COLUMNS/.test(sql) && params[0] === 'companies') {
      return [[
        { COLUMN_NAME: 'name' },
        { COLUMN_NAME: 'Gov_Registration_number' },
        { COLUMN_NAME: 'Address' },
        { COLUMN_NAME: 'Telephone' },
        { COLUMN_NAME: 'created_by' }
      ]];
    }
    if (sql.startsWith('INSERT INTO ??') && params[0] === 'companies') {
      return [{ insertId: 9 }];
    }
    if (/FROM tenant_tables/.test(sql)) {
      return [[{ table_name: 'posts', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*)') && params[0] === 'posts') {
      return [[{ cnt: 2 }]];
    }
    if (/information_schema\.COLUMNS/.test(sql) && params[0] === 'posts') {
      return [[{ COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' }]];
    }
    if (/table_column_labels/.test(sql)) {
      return [[]];
    }
    if (sql.startsWith('DELETE FROM ??') && params[0] === 'posts') {
      deleteCalled = true;
      return [{}];
    }
    if (sql.startsWith('INSERT INTO ??') && params[0] === 'posts') {
      inserts.push(params);
      return [{}];
    }
    if (/INSERT INTO user_level_permissions/.test(sql)) {
      return [[]];
    }
    return [[]];
  };
  const req = {
    body: {
      name: 'SeedCo',
      Gov_Registration_number: '123',
      Address: 'Addr',
      Telephone: '555',
      seedTables: ['posts'],
      seedRecords: { posts: [{ id: 1 }, { id: 2 }] },
      overwrite: true,
    },
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await createCompanyHandler(req, res, () => {});
  db.pool.query = orig;
  assert.equal(deleteCalled, true);
  assert.deepEqual(inserts, [
    ['posts', 9, 1],
    ['posts', 9, 2],
  ]);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { id: 9 });
});

test('deleteCompanyHandler deletes company with cascade', async () => {
  const calls = [];
  const userId = 1;
  const companyId = 5;
  const tenantCompanyId = 55;
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM companies WHERE created_by = ?')) {
      return [[{
        id: companyId,
        company_id: tenantCompanyId,
        name: 'DemoCo',
        created_by: userId,
      }]];
    }
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      if (params?.[0] === 'companies') {
        return [[
          { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
          { COLUMN_NAME: 'id', SEQ_IN_INDEX: 2 },
        ]];
      }
      if (params?.[0] === 'orders') {
        return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
      }
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params?.[0] === 'companies') {
        return [[
          {
            CONSTRAINT_NAME: 'fk_orders_companies',
            TABLE_NAME: 'orders',
            COLUMN_NAME: 'company_id',
            REFERENCED_COLUMN_NAME: 'company_id',
          },
          {
            CONSTRAINT_NAME: 'fk_orders_companies',
            TABLE_NAME: 'orders',
            COLUMN_NAME: 'company_ref_id',
            REFERENCED_COLUMN_NAME: 'id',
          },
        ]];
      }
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      return [[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'company_id' }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params?.[0], 'orders');
      assert.deepEqual(params?.slice(1), [
        'company_id',
        String(tenantCompanyId),
        'company_ref_id',
        String(companyId),
      ]);
      return [[{ count: 1 }]];
    }
    if (sql.startsWith('SELECT `id` FROM')) {
      assert.equal(params?.[0], 'orders');
      assert.deepEqual(params?.slice(1), [
        'company_id',
        String(tenantCompanyId),
        'company_ref_id',
        String(companyId),
      ]);
      return [[{ id: 3 }]];
    }
    if (sql.startsWith('DELETE FROM')) {
      return [{}];
    }
    throw new Error('unexpected query');
  });
  const req = {
    params: { id: String(companyId) },
    user: { empid: userId, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await deleteCompanyHandler(req, res, () => {});
  restore();
  const deletes = calls.filter(c => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  const ordersDelete = deletes.find((c) => c.params?.[0] === 'orders');
  assert.deepEqual(ordersDelete?.params, ['orders', 3, tenantCompanyId]);
  const companiesDelete = deletes.find((c) => c.params?.[0] === 'companies');
  assert.deepEqual(companiesDelete?.params, [
    'companies',
    String(tenantCompanyId),
    String(companyId),
  ]);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {
    backup: null,
    company: { id: companyId, name: 'DemoCo' }
  });
});

test('deleteCompanyHandler cascades through employment and users tables', async () => {
  const calls = [];
  const employeeCode = 'EMP-1';
  const tenantCompanyId = 7;
  const companyId = 7;
  const employmentRow = {
    company_id: String(tenantCompanyId),
    employment_emp_id: 'EMP9',
    employment_position_id: '10',
    employment_workplace_id: '20',
    employment_date: '20240101',
    employment_department_id: '30',
    employment_branch_id: '40',
    employment_company_id: String(companyId),
  };
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM companies WHERE created_by = ?')) {
      assert.equal(params?.[0], employeeCode);
      return [[{
        id: companyId,
        company_id: tenantCompanyId,
        name: 'CascadeCo',
        created_by: employeeCode,
      }]];
    }
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      if (params?.[0] === 'companies') {
        return [[
          { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
          { COLUMN_NAME: 'id', SEQ_IN_INDEX: 2 },
        ]];
      }
      if (params?.[0] === 'tbl_employment') {
        return [[]];
      }
      if (params?.[0] === 'users') {
        return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
      }
    }
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes('NON_UNIQUE = 0')
    ) {
      if (params?.[0] === 'tbl_employment') {
        return [[
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_emp_id', SEQ_IN_INDEX: 2 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_position_id', SEQ_IN_INDEX: 3 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_workplace_id', SEQ_IN_INDEX: 4 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_date', SEQ_IN_INDEX: 5 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_department_id', SEQ_IN_INDEX: 6 },
          { INDEX_NAME: 'uniq', COLUMN_NAME: 'employment_branch_id', SEQ_IN_INDEX: 7 },
        ]];
      }
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params?.[0] === 'companies') {
        return [[{
          CONSTRAINT_NAME: 'fk_employment_company',
          TABLE_NAME: 'tbl_employment',
          COLUMN_NAME: 'employment_company_id',
          REFERENCED_COLUMN_NAME: 'id',
        }]];
      }
      if (params?.[0] === 'tbl_employment') {
        return [[
          {
            CONSTRAINT_NAME: 'users_ibfk_1',
            TABLE_NAME: 'users',
            COLUMN_NAME: 'company_id',
            REFERENCED_COLUMN_NAME: 'employment_company_id',
          },
          {
            CONSTRAINT_NAME: 'users_ibfk_1',
            TABLE_NAME: 'users',
            COLUMN_NAME: 'empid',
            REFERENCED_COLUMN_NAME: 'employment_emp_id',
          },
        ]];
      }
      if (params?.[0] === 'users') {
        return [[]];
      }
    }
    if (sql.startsWith('SELECT COUNT(*) AS count FROM ?? WHERE')) {
      if (params?.[0] === 'tbl_employment') {
        assert.deepEqual(params, [
          'tbl_employment',
          'employment_company_id',
          String(companyId),
        ]);
        return [[{ count: 1 }]];
      }
      if (params?.[0] === 'users') {
        assert.deepEqual(params, [
          'users',
          'company_id',
          String(companyId),
          'empid',
          employmentRow.employment_emp_id,
        ]);
        return [[{ count: 1 }]];
      }
    }
    if (sql.startsWith('SELECT `company_id`') && params?.[0] === 'tbl_employment') {
      assert.deepEqual(params, [
        'tbl_employment',
        'employment_company_id',
        String(companyId),
      ]);
      return [[employmentRow]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE') && params?.[0] === 'tbl_employment') {
      assert.deepEqual(params, [
        'tbl_employment',
        'company_id',
        employmentRow.company_id,
        'employment_emp_id',
        employmentRow.employment_emp_id,
        'employment_position_id',
        employmentRow.employment_position_id,
        'employment_workplace_id',
        employmentRow.employment_workplace_id,
        'employment_date',
        employmentRow.employment_date,
        'employment_department_id',
        employmentRow.employment_department_id,
        'employment_branch_id',
        employmentRow.employment_branch_id,
      ]);
      return [[employmentRow]];
    }
    if (sql.startsWith('SELECT `id` FROM ?? WHERE') && params?.[0] === 'users') {
      assert.deepEqual(params, [
        'users',
        'company_id',
        String(companyId),
        'empid',
        employmentRow.employment_emp_id,
      ]);
      return [[{ id: 99 }]];
    }
    if (sql.includes('information_schema.COLUMNS')) {
      if (params?.[0] === 'users') {
        return [[
          { COLUMN_NAME: 'id' },
          { COLUMN_NAME: 'password' },
          { COLUMN_NAME: 'created_by' },
          { COLUMN_NAME: 'created_at' },
          { COLUMN_NAME: 'empid' },
          { COLUMN_NAME: 'company_id' },
        ]];
      }
      if (params?.[0] === 'tbl_employment') {
        return [[
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'employment_emp_id' },
          { COLUMN_NAME: 'employment_position_id' },
          { COLUMN_NAME: 'employment_workplace_id' },
          { COLUMN_NAME: 'employment_date' },
          { COLUMN_NAME: 'employment_department_id' },
          { COLUMN_NAME: 'employment_branch_id' },
          { COLUMN_NAME: 'employment_company_id' },
        ]];
      }
      if (params?.[0] === 'companies') {
        return [[
          { COLUMN_NAME: 'company_id' },
          { COLUMN_NAME: 'id' },
          { COLUMN_NAME: 'name' },
          { COLUMN_NAME: 'created_by' },
        ]];
      }
    }
    if (sql.startsWith('DELETE FROM ?? WHERE') && params?.[0] === 'users') {
      return [{}];
    }
    if (sql.startsWith('DELETE FROM ?? WHERE') && params?.[0] === 'tbl_employment') {
      return [{}];
    }
    if (sql.startsWith('DELETE FROM ?? WHERE') && params?.[0] === 'companies') {
      return [{}];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { id: String(companyId) },
    user: { empid: employeeCode, companyId: 0 },
    session: { permissions: { system_settings: true } },
    body: {},
  };
  const res = createRes();
  await deleteCompanyHandler(req, res, () => {});
  restore();
  const deletes = calls.filter((c) => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 3);
  const userDelete = deletes.find((c) => c.params?.[0] === 'users');
  assert.deepEqual(
    userDelete ? userDelete.params.map((p) => String(p)) : null,
    ['users', '99', String(tenantCompanyId)],
  );
  const employmentDelete = deletes.find((c) => c.params?.[0] === 'tbl_employment');
  assert.deepEqual(
    employmentDelete ? employmentDelete.params.map((p) => String(p)) : null,
    [
      'tbl_employment',
      employmentRow.company_id,
      employmentRow.employment_emp_id,
      employmentRow.employment_position_id,
      employmentRow.employment_workplace_id,
      employmentRow.employment_date,
      employmentRow.employment_department_id,
      employmentRow.employment_branch_id,
    ],
  );
  const companyDelete = deletes.find((c) => c.params?.[0] === 'companies');
  assert.deepEqual(
    companyDelete ? companyDelete.params.map((p) => String(p)) : null,
    ['companies', String(tenantCompanyId), String(companyId)],
  );
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {
    backup: null,
    company: { id: companyId, name: 'CascadeCo' }
  });
});

test('deleteCompanyHandler returns backup metadata when requested', async () => {
  const calls = [];
  const userId = 7;
  const employeeCode = 'EMP-7A';
  const companyId = 9;
  const tenantCompanyId = 90;
  const backupDir = path.join(process.cwd(), 'config', String(companyId));
  await fs.rm(backupDir, { recursive: true, force: true });
  const restore = mockPool(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM companies WHERE created_by = ?')) {
      assert.equal(params?.[0], employeeCode);
      return [[{
        id: companyId,
        company_id: tenantCompanyId,
        name: 'BackupCo',
        created_by: employeeCode,
      }]];
    }
    if (sql.includes('FROM tenant_tables WHERE seed_on_create = 1')) {
      return [[{ table_name: 'orders', is_shared: 0 }]];
    }
    if (sql.startsWith('SELECT COUNT(*) AS cnt FROM ??') && params?.[0] === 'orders') {
      return [[{ cnt: 1 }]];
    }
    if (
      sql.includes('information_schema.STATISTICS') &&
      sql.includes("INDEX_NAME = 'PRIMARY'")
    ) {
      if (params?.[0] === 'companies') {
        return [[
          { COLUMN_NAME: 'company_id', SEQ_IN_INDEX: 1 },
          { COLUMN_NAME: 'id', SEQ_IN_INDEX: 2 },
        ]];
      }
      if (params?.[0] === 'orders') {
        return [[{ COLUMN_NAME: 'id', SEQ_IN_INDEX: 1 }]];
      }
    }
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
      if (params?.[0] === 'companies') {
        return [[
          {
            CONSTRAINT_NAME: 'fk_orders_companies',
            TABLE_NAME: 'orders',
            COLUMN_NAME: 'company_id',
            REFERENCED_COLUMN_NAME: 'company_id',
          },
          {
            CONSTRAINT_NAME: 'fk_orders_companies',
            TABLE_NAME: 'orders',
            COLUMN_NAME: 'company_ref_id',
            REFERENCED_COLUMN_NAME: 'id',
          },
        ]];
      }
      return [[]];
    }
    if (sql.includes('information_schema.COLUMNS') && params?.[0] === 'orders') {
      return [[
        { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
        { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
        { COLUMN_NAME: 'name', COLUMN_KEY: '', EXTRA: '' },
      ]];
    }
    if (sql.includes('FROM table_column_labels WHERE table_name = ?')) {
      return [[]];
    }
    if (sql.startsWith('SELECT * FROM ?? WHERE company_id = ?') && params?.[0] === 'orders') {
      return [[{ id: 11, company_id: tenantCompanyId, name: 'Sample order' }]];
    }
    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.equal(params?.[0], 'orders');
      assert.deepEqual(params?.slice(1), [
        'company_id',
        String(tenantCompanyId),
        'company_ref_id',
        String(companyId),
      ]);
      return [[{ count: 1 }]];
    }
    if (sql.startsWith('SELECT `id` FROM')) {
      assert.equal(params?.[0], 'orders');
      assert.deepEqual(params?.slice(1), [
        'company_id',
        String(tenantCompanyId),
        'company_ref_id',
        String(companyId),
      ]);
      return [[{ id: 11 }]];
    }
    if (sql.startsWith('DELETE FROM')) {
      return [{}];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const req = {
    params: { id: String(companyId) },
    body: { createBackup: true, backupName: 'Company 9 backup' },
    user: { id: userId, empid: employeeCode, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  try {
    await deleteCompanyHandler(req, res, () => {});
  } finally {
    restore();
    await fs.rm(backupDir, { recursive: true, force: true });
  }
  const deletes = calls.filter((c) => c.sql.startsWith('DELETE FROM'));
  assert.equal(deletes.length, 2);
  const ordersDelete = deletes.find((c) => c.params?.[0] === 'orders');
  assert.deepEqual(ordersDelete?.params, ['orders', 11, tenantCompanyId]);
  const companiesDelete = deletes.find((c) => c.params?.[0] === 'companies');
  assert.deepEqual(companiesDelete?.params, [
    'companies',
    String(tenantCompanyId),
    String(companyId),
  ]);
  assert.equal(res.code, 200);
  assert.ok(res.body.backup);
  assert.equal(res.body.backup.companyId, companyId);
  assert.equal(res.body.backup.originalName, 'Company 9 backup');
  assert.equal(res.body.backup.requestedBy, userId);
  assert.equal(res.body.company.name, 'BackupCo');
});

test('deleteCompanyHandler forwards error messages', async () => {
  const restore = mockPool(async () => {
    throw new Error('boom');
  });
  const req = {
    params: { id: '5' },
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  await deleteCompanyHandler(req, res, () => {});
  restore();
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { message: 'boom' });
});

test('listCompanyBackupsHandler returns backups', async () => {
  const userId = 44;
  const employeeCode = 'EMP-44A';
  const companyId = 12;
  const backupDir = path.join(
    process.cwd(),
    'config',
    String(companyId),
    'defaults',
    'seed-backups',
  );
  await fs.rm(path.join(process.cwd(), 'config', String(companyId)), {
    recursive: true,
    force: true,
  });
  await fs.mkdir(backupDir, { recursive: true });
  const entry = {
    companyId,
    fileName: 'manual-backup.sql',
    originalName: 'Latest backup',
    generatedAt: '2024-01-01T00:00:00.000Z',
    requestedBy: userId,
    companyName: 'ActiveCo',
  };
  await fs.writeFile(
    path.join(backupDir, 'index.json'),
    JSON.stringify([entry], null, 2),
    'utf8',
  );
  const restorePool = mockPool(async (sql, params) => {
    if (sql.startsWith('SELECT * FROM companies WHERE created_by = ?')) {
      assert.equal(params?.[0], employeeCode);
      return [[{ id: companyId, name: 'ActiveCo', created_by: employeeCode }]];
    }
    return [[]];
  });
  const req = {
    user: { id: userId, empid: employeeCode, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  try {
    await listCompanyBackupsHandler(req, res, () => {});
  } finally {
    restorePool();
    await fs.rm(path.join(process.cwd(), 'config', String(companyId)), {
      recursive: true,
      force: true,
    });
  }
  assert.ok(res.body);
  assert.ok(Array.isArray(res.body.backups));
  assert.equal(res.body.backups.length, 1);
  assert.equal(res.body.backups[0].companyId, companyId);
  assert.equal(res.body.backups[0].fileName, entry.fileName);
});

test('restoreCompanyBackupHandler restores backup', async () => {
  const userId = 91;
  const employeeCode = 'EMP-91B';
  const sourceCompanyId = 15;
  const targetCompanyId = 20;
  const backupRoot = path.join(process.cwd(), 'config');
  const sourceDir = path.join(backupRoot, String(sourceCompanyId));
  const backupDir = path.join(sourceDir, 'defaults', 'seed-backups');
  await fs.rm(sourceDir, { recursive: true, force: true });
  await fs.mkdir(backupDir, { recursive: true });
  const fileName = 'manual.sql';
  const sqlLines = [
    '-- Tenant seed backup',
    `-- Company ID: ${sourceCompanyId}`,
    '-- Backup name: Tenant snapshot',
    `-- Generated at: ${new Date().toISOString()}`,
    '',
    'START TRANSACTION;',
    `DELETE FROM orders WHERE company_id = ${sourceCompanyId};`,
    `INSERT INTO \`orders\` (\`company_id\`, \`id\`, \`name\`) VALUES (${sourceCompanyId}, 1, 'Example');`,
    'COMMIT;',
  ];
  await fs.writeFile(path.join(backupDir, fileName), sqlLines.join('\n'), 'utf8');
  const catalogEntry = {
    companyId: sourceCompanyId,
    fileName,
    originalName: 'Tenant snapshot',
    generatedAt: '2024-01-02T00:00:00.000Z',
    requestedBy: userId,
  };
  await fs.writeFile(
    path.join(backupDir, 'index.json'),
    JSON.stringify([catalogEntry], null, 2),
    'utf8',
  );
  const calls = [];
  const restorePool = mockPool(async (sql, params) => {
    calls.push(sql);
    if (sql.startsWith('SELECT * FROM companies WHERE created_by = ?')) {
      assert.equal(params?.[0], employeeCode);
      return [[{ id: targetCompanyId, name: 'TargetCo', created_by: employeeCode }]];
    }
    if (
      sql.includes('FROM tenant_tables') &&
      sql.includes('seed_on_create = 1') &&
      sql.includes('is_shared = 0')
    ) {
      return [[{ table_name: 'orders' }]];
    }
    if (sql.startsWith('DELETE FROM')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO')) {
      return [{ affectedRows: 1 }];
    }
    return [[]];
  });
  const req = {
    body: { sourceCompanyId, targetCompanyId, fileName },
    user: { id: userId, empid: employeeCode, companyId: 0 },
    session: { permissions: { system_settings: true } },
  };
  const res = createRes();
  try {
    await restoreCompanyBackupHandler(req, res, () => {});
  } finally {
    restorePool();
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
  // ensure restore completed using mocked SQL responses
  assert.ok(res.body.summary, `Unexpected restore response: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.summary);
  assert.equal(res.body.summary.sourceCompanyId, sourceCompanyId);
  assert.equal(res.body.summary.targetCompanyId, targetCompanyId);
});

test(
  'creating a company keeps tenant tables empty until seed endpoint runs',
  async (t) => {
    const companies = [];
    const posts = [];
    let tenantTableSelects = 0;
    const queryMock = t.mock.method(db.pool, 'query', async (sql, params) => {
      if (
        typeof sql === 'string' &&
        /information_schema\.COLUMNS/.test(sql) &&
        sql.startsWith('SELECT COLUMN_NAME')
      ) {
        if (params?.[0] === 'companies') {
          return [[
            { COLUMN_NAME: 'name' },
            { COLUMN_NAME: 'created_by' },
          ]];
        }
        if (params?.[0] === 'posts') {
          return [[
            { COLUMN_NAME: 'id' },
            { COLUMN_NAME: 'company_id' },
            { COLUMN_NAME: 'title' },
          ]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT INTO ??') &&
        params?.[0] === 'companies'
      ) {
        const id = companies.length + 1;
        const open = sql.indexOf('(');
        const close = sql.indexOf(')', open + 1);
        const columnSegment = sql.slice(open + 1, close);
        const columns = columnSegment
          .split(',')
          .map((c) => c.trim().replace(/`/g, ''));
        const values = params.slice(1);
        const record = { id };
        columns.forEach((col, idx) => {
          record[col] = values[idx];
        });
        companies.push(record);
        return [{ insertId: id }];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('INSERT INTO ??') &&
        params?.[0] === 'posts'
      ) {
        const open = sql.indexOf('(');
        const close = sql.indexOf(')', open + 1);
        const columnSegment = sql.slice(open + 1, close);
        const columns = columnSegment
          .split(',')
          .map((c) => c.trim().replace(/`/g, ''));
        const values = params.slice(1);
        const record = {};
        columns.forEach((col, idx) => {
          record[col] = values[idx];
        });
        posts.push(record);
        return [{}];
      }
      if (typeof sql === 'string' && sql === 'SELECT * FROM companies') {
        return [companies.map((c) => ({ ...c }))];
      }
      if (
        typeof sql === 'string' &&
        sql === 'SELECT * FROM companies WHERE created_by = ?'
      ) {
        const creator = params?.[0];
        return [
          companies
            .filter((c) => c.created_by === creator)
            .map((c) => ({ ...c })),
        ];
      }
      if (
        typeof sql === 'string' &&
        sql.includes('FROM tbl_employment e') &&
        sql.includes('GROUP BY e.employment_company_id')
      ) {
        const [, companyId] = params || [];
        return [[
          {
            company_id: companyId ?? 0,
            branch_id: 0,
            department_id: 0,
            position_id: 0,
            senior_empid: null,
            employee_name: 'Admin',
            user_level: 1,
            user_level_name: 'Admin',
            permission_list: 'system_settings',
          },
        ]];
      }
      if (
        typeof sql === 'string' &&
        sql.includes('FROM tenant_tables WHERE seed_on_create = 1')
      ) {
        tenantTableSelects += 1;
        const rows = [
          { table_name: 'posts', is_shared: 0 },
        ];
        return [rows];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('SELECT COUNT(*) AS cnt FROM ?? WHERE company_id = ?')
      ) {
        const [tableName, companyId] = params || [];
        if (tableName === 'posts') {
          const count = posts.filter(
            (p) => Number(p.company_id) === Number(companyId),
          ).length;
          return [[{ cnt: count }]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith('SELECT COLUMN_NAME, COLUMN_KEY, EXTRA') &&
        sql.includes('information_schema.COLUMNS')
      ) {
        if (params?.[0] === 'posts') {
          return [[
            { COLUMN_NAME: 'id', COLUMN_KEY: 'PRI', EXTRA: '' },
            { COLUMN_NAME: 'company_id', COLUMN_KEY: '', EXTRA: '' },
            { COLUMN_NAME: 'title', COLUMN_KEY: '', EXTRA: '' },
          ]];
        }
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith(
          'SELECT column_name, mn_label FROM table_column_labels WHERE table_name = ?',
        )
      ) {
        return [[]];
      }
      if (
        typeof sql === 'string' &&
        sql.startsWith(
          'INSERT INTO user_level_permissions (company_id, userlevel_id, action, action_key, created_by, created_at)',
        )
      ) {
        return [[]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const req = {
      body: { name: 'Seedless Co' },
      user: { empid: 42, companyId: 0, userLevel: 1 },
      session: { permissions: { system_settings: true } },
    };
    const res = createRes();
    await createCompanyHandler(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.code, 201);
    assert.equal(tenantTableSelects, 0);
    assert.deepEqual(posts, []);
    const companyId = res.body.id;

    const seedReq = {
      body: {
        companyId,
        tables: ['posts'],
        records: [
          {
            table: 'posts',
            rows: [{ id: 7, title: 'Welcome' }],
          },
        ],
        overwrite: false,
      },
      user: { empid: 42, companyId: 0 },
    };
    const seedRes = createRes();
    await seedCompany(seedReq, seedRes, (err) => {
      if (err) throw err;
    });
    assert.ok(tenantTableSelects > 0);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      company_id: companyId,
      id: 7,
      title: 'Welcome',
    });
    assert.equal(seedRes.body?.summary?.posts?.count, 1);
    assert.ok(queryMock.mock.calls.length > 0);
  },
);
