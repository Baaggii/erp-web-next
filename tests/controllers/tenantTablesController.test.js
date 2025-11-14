import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const CONFLICT_MESSAGE =
  'Shared tables always read from tenant key 0, so they cannot participate in per-company seeding.';

function createRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      if (this.statusCode === undefined) {
        this.statusCode = 200;
      }
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = undefined;
      return this;
    },
  };
}

async function loadController(overrides = {}) {
  const baseDb = {
    listTenantTables: async () => [],
    upsertTenantTable: async () => ({}),
    getEmploymentSession: async () => ({}),
    listAllTenantTableOptions: async () => [],
    getTenantTable: async () => null,
    zeroSharedTenantKeys: async () => ({ tables: [], totals: {} }),
    seedDefaultsForSeedTables: async () => {},
    seedTenantTables: async () => ({}),
    listCompanies: async () => [],
    insertTenantDefaultRow: async () => ({}),
    updateTenantDefaultRow: async () => ({}),
    deleteTenantDefaultRow: async () => {},
    exportTenantTableDefaults: async () => ({}),
    ...overrides,
  };
  const mod = await mock.import(
    '../../api-server/controllers/tenantTablesController.js',
    {
      '../../db/index.js': baseDb,
    },
  );
  return mod;
}

if (typeof mock?.import !== 'function') {
  test('getTenantTable returns tenant metadata', { skip: true }, () => {});
  test('getTenantTable requires table_name param', { skip: true }, () => {});
  test('getTenantTable returns 404 when table not found', { skip: true }, () => {});
  test('getTenantTable forwards database errors', { skip: true }, () => {});
} else {
  test('getTenantTable returns tenant metadata', async () => {
    const req = { params: { table_name: 'users' } };
    const res = createRes();
    const stub = mock.fn(async () => ({
      tableName: 'users',
      isShared: false,
      tenantKeys: ['company_id'],
    }));
    const { getTenantTable } = await loadController({ getTenantTable: stub });
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.deepEqual(res.body, {
      tableName: 'users',
      isShared: false,
      tenantKeys: ['company_id'],
    });
    assert.equal(stub.mock.calls.length, 1);
  });

  test('getTenantTable requires table_name param', async () => {
    const req = { params: {} };
    const res = createRes();
    const { getTenantTable } = await loadController();
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.message, 'table_name is required');
  });

  test('getTenantTable returns 404 when table not found', async () => {
    const req = { params: { table_name: 'missing' } };
    const res = createRes();
    const { getTenantTable } = await loadController({ getTenantTable: async () => null });
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body?.message, 'Table not found');
  });

  test('getTenantTable forwards database errors', async () => {
    const req = { params: { table_name: 'users' } };
    const res = createRes();
    const failure = new Error('db failed');
    const { getTenantTable } = await loadController({
      getTenantTable: async () => {
        throw failure;
      },
    });
    let captured;
    await getTenantTable(req, res, (err) => {
      captured = err;
    });
    assert.equal(captured, failure);
  });

  test('getTenantTable forwards user companyId to database lookup', async () => {
    const req = { params: { table_name: 'users' }, user: { companyId: 42 } };
    const res = createRes();
    const stub = mock.fn(async () => ({
      tableName: 'users',
      tenantKeys: ['company_id'],
      isShared: false,
    }));
    const { getTenantTable } = await loadController({ getTenantTable: stub });
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(stub.mock.calls.length, 1);
    assert.equal(stub.mock.calls[0].arguments[0], 'users');
    assert.equal(stub.mock.calls[0].arguments[1], 42);
  });

  test('getTenantTable prefers querystring companyId over session company', async () => {
    const req = {
      params: { table_name: 'users' },
      query: { companyId: '77' },
      user: { companyId: 5 },
    };
    const res = createRes();
    const stub = mock.fn(async () => ({
      tableName: 'users',
      tenantKeys: ['company_id'],
      isShared: true,
    }));
    const { getTenantTable } = await loadController({ getTenantTable: stub });
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(stub.mock.calls.length, 1);
    assert.equal(stub.mock.calls[0].arguments[0], 'users');
    assert.equal(stub.mock.calls[0].arguments[1], 77);
  });

  test('createTenantTable rejects shared seed_on_create combination', async () => {
    const upsertStub = mock.fn(async () => {
      throw new Error('should not be called');
    });
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      upsertTenantTable: upsertStub,
    });
    const req = {
      body: { tableName: 'posts', isShared: true, seedOnCreate: true },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.createTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.message, CONFLICT_MESSAGE);
    assert.equal(upsertStub.mock.calls.length, 0);
  });

  test('updateTenantTable rejects shared seed_on_create combination', async () => {
    const upsertStub = mock.fn(async () => {
      throw new Error('should not be called');
    });
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      upsertTenantTable: upsertStub,
    });
    const req = {
      params: { table_name: 'posts' },
      body: { isShared: true, seedOnCreate: true },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.updateTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.message, CONFLICT_MESSAGE);
    assert.equal(upsertStub.mock.calls.length, 0);
  });

  test('seedCompany returns summary payload', async () => {
    const summary = { posts: { count: 2, ids: ['1', '2'] } };
    const backup = { fileName: 'backup.sql' };
    const seedStub = mock.fn(async () => ({ summary, backup }));
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      listCompanies: async () => [
        { id: 7, created_by: 99 },
        { id: 8, created_by: 5 },
      ],
      seedTenantTables: seedStub,
    });
    const req = {
      body: { companyId: 8, tables: ['posts'], records: [], overwrite: false },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.seedCompany(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { summary, backup });
    assert.equal(seedStub.mock.calls.length, 1);
    const args = seedStub.mock.calls[0].arguments;
    assert.equal(args[0], 8);
    assert.deepEqual(args[1], ['posts']);
    assert.deepEqual(args[2], {});
    assert.equal(args[3], false);
    assert.equal(args[4], 5);
    assert.equal(args[5], 5);
    assert.deepEqual(args[6], {
      backupName: '',
      originalBackupName: '',
      requestedBy: 5,
    });
  });

  test('seedCompany forwards manual rows payload', async () => {
    const manualRows = [{ id: 7, title: 'Welcome' }];
    const seedStub = mock.fn(async () => ({ summary: {} }));
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      listCompanies: async () => [
        { id: 8, created_by: 5 },
      ],
      seedTenantTables: seedStub,
    });
    const req = {
      body: {
        companyId: 8,
        tables: ['posts'],
        records: [{ table: 'posts', rows: manualRows }],
        overwrite: true,
      },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.seedCompany(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.equal(seedStub.mock.calls.length, 1);
    const args = seedStub.mock.calls[0].arguments;
    assert.equal(args[0], 8);
    assert.deepEqual(args[1], ['posts']);
    assert.deepEqual(args[2], { posts: [{ id: 7, title: 'Welcome' }] });
    assert.equal(args[3], true);
    assert.equal(args[4], 5);
    assert.equal(args[5], 5);
    assert.deepEqual(args[6], {
      backupName: '',
      originalBackupName: '',
      requestedBy: 5,
    });
    assert.notStrictEqual(args[2].posts[0], manualRows[0]);
  });

  test('seedCompany inserts manual rows without audit columns', async () => {
    const manualRows = [
      { id: 1, title: 'Welcome', body: 'Hello' },
      { id: 2, title: 'Getting Started', body: 'Steps' },
    ];
    const summary = { posts: { count: manualRows.length, ids: [1, 2] } };
    const seedStub = mock.fn(async (companyId, tables, records, overwrite, userId) => {
      assert.equal(companyId, 8);
      assert.deepEqual(tables, ['posts']);
      assert.equal(overwrite, false);
      assert.equal(userId, 5);
      const rows = records?.posts;
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, manualRows.length);
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          const lower = key.toLowerCase();
          if (lower.startsWith('created_') || lower.startsWith('updated_')) {
            const err = new Error('ER_BAD_FIELD_ERROR');
            err.code = 'ER_BAD_FIELD_ERROR';
            throw err;
          }
        }
      }
      return { summary };
    });
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      listCompanies: async () => [
        { id: 8, created_by: 5 },
      ],
      seedTenantTables: seedStub,
    });
    const req = {
      body: {
        companyId: 8,
        tables: ['posts'],
        records: [
          {
            table: 'posts',
            rows: manualRows,
          },
        ],
        overwrite: false,
      },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.seedCompany(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { summary, backup: null });
    assert.equal(seedStub.mock.calls.length, 1);
    const args = seedStub.mock.calls[0].arguments;
    assert.equal(args[5], 5);
    assert.deepEqual(args[6], {
      backupName: '',
      originalBackupName: '',
      requestedBy: 5,
    });
  });

  test('seedCompany rejects invalid manual rows', async () => {
    const seedStub = mock.fn(async () => ({}));
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      listCompanies: async () => [
        { id: 8, created_by: 5 },
      ],
      seedTenantTables: seedStub,
    });
    const req = {
      body: {
        companyId: 8,
        tables: ['posts'],
        records: [{ table: 'posts', rows: [null, { id: 1 }] }],
        overwrite: false,
      },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.seedCompany(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message ?? '', /Invalid manual row payload/);
    assert.equal(seedStub.mock.calls.length, 0);
  });

  test('seedDefaults creates backup metadata before populating', async () => {
    const calls = [];
    const seedDefaultsStub = mock.fn(async (userId, options = {}) => {
      calls.push(options);
      return {};
    });
    const exportStub = mock.fn(async (name, requestedBy) => ({
      fileName: '20240101_manual-backup.sql',
      originalName: name,
      versionName: 'manual-backup',
      requestedBy,
    }));
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      seedDefaultsForSeedTables: seedDefaultsStub,
      exportTenantTableDefaults: exportStub,
    });
    const req = {
      body: { backupName: '  Manual Backup  ' },
      user: { empid: 7, companyId: 1 },
    };
    const res = createRes();
    await mod.seedDefaults(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body?.backup);
    assert.equal(res.body.backup.fileName, '20240101_manual-backup.sql');
    assert.equal(res.body.backup.originalName, 'Manual Backup');
    assert.equal(exportStub.mock.calls.length, 1);
    assert.deepEqual(exportStub.mock.calls[0].arguments, ['Manual Backup', 7]);
    assert.equal(seedDefaultsStub.mock.calls.length, 2);
    assert.equal(calls[0]?.preview, true);
    assert.equal(calls[1]?.preview, undefined);
  });

  test('seedExistingCompanies returns summaries keyed by company', async () => {
    const seedStub = mock.fn(async (companyId) => ({ posts: { count: companyId } }));
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      listCompanies: async () => [
        { id: 0, created_by: 5 },
        { id: 10, created_by: 5 },
        { id: 11, created_by: 6 },
        { id: 12, created_by: 5 },
      ],
      seedTenantTables: seedStub,
    });
    const req = {
      body: {
        tables: ['posts'],
        records: [{ table: 'posts', ids: [3, 4] }],
        overwrite: true,
      },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.seedExistingCompanies(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      10: { posts: { count: 10 } },
      12: { posts: { count: 12 } },
    });
    assert.equal(seedStub.mock.calls.length, 2);
    assert.deepEqual(seedStub.mock.calls[0].arguments, [
      10,
      ['posts'],
      { posts: [3, 4] },
      true,
      5,
      5,
      { backupName: '', originalBackupName: '', requestedBy: 5 },
    ]);
    assert.deepEqual(seedStub.mock.calls[1].arguments, [
      12,
      ['posts'],
      { posts: [3, 4] },
      true,
      5,
      5,
      { backupName: '', originalBackupName: '', requestedBy: 5 },
    ]);
  });

  test('resetSharedTenantKeys returns summary payload', async () => {
    const summary = {
      tables: [
        {
          tableName: 'users',
          totalRows: 4,
          updatedRows: 3,
          skippedRows: 1,
          skippedRecords: [{ id: 1, company_id: 2 }],
        },
      ],
      totals: { tablesProcessed: 1, totalRows: 4, updatedRows: 3, skippedRows: 1 },
    };
    const zeroStub = mock.fn(async () => summary);
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      zeroSharedTenantKeys: zeroStub,
    });
    const req = { user: { empid: 5, companyId: 1 } };
    const res = createRes();
    await mod.resetSharedTenantKeys(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, summary);
    assert.equal(zeroStub.mock.calls.length, 1);
    assert.deepEqual(zeroStub.mock.calls[0].arguments, [5]);
  });

  test('insertDefaultTenantRow returns inserted row payload', async () => {
    const created = { id: 3, company_id: 0, title: 'Hello' };
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      getTenantTable: async () => ({ tableName: 'posts', tenantKeys: ['company_id'] }),
      insertTenantDefaultRow: async () => created,
    });
    const req = {
      params: { table_name: 'posts' },
      body: { title: 'Hello' },
      user: { empid: 9, companyId: 1 },
    };
    const res = createRes();
    await mod.insertDefaultTenantRow(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { row: created });
  });

  test('insertDefaultTenantRow rejects non-zero company id in payload', async () => {
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      getTenantTable: async () => ({ tableName: 'posts', tenantKeys: ['company_id'] }),
    });
    const req = {
      params: { table_name: 'posts' },
      body: { title: 'Hello', company_id: 9 },
      user: { empid: 9, companyId: 1 },
    };
    const res = createRes();
    await mod.insertDefaultTenantRow(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message ?? '', /company_id must be 0/i);
  });

  test('updateDefaultTenantRow returns updated row payload', async () => {
    const updated = { id: 4, company_id: 0, title: 'Updated' };
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      getTenantTable: async () => ({ tableName: 'posts', tenantKeys: ['company_id'] }),
      updateTenantDefaultRow: async (table, rowId, payload, userId) => {
        assert.equal(table, 'posts');
        assert.equal(rowId, '4');
        assert.deepEqual(payload, { title: 'Updated' });
        assert.equal(userId, 9);
        return updated;
      },
    });
    const req = {
      params: { table_name: 'posts', row_id: '4' },
      body: { title: 'Updated' },
      user: { empid: 9, companyId: 1 },
    };
    const res = createRes();
    await mod.updateDefaultTenantRow(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { row: updated });
  });

  test('deleteDefaultTenantRow returns 204 on success', async () => {
    const deleteStub = mock.fn(async () => {});
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      getTenantTable: async () => ({ tableName: 'posts', tenantKeys: ['company_id'] }),
      deleteTenantDefaultRow: deleteStub,
    });
    const req = {
      params: { table_name: 'posts', row_id: '9' },
      user: { empid: 9, companyId: 1 },
    };
    const res = createRes();
    await mod.deleteDefaultTenantRow(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 204);
    assert.equal(deleteStub.mock.calls.length, 1);
    assert.deepEqual(deleteStub.mock.calls[0].arguments, ['posts', '9', 9]);
  });

  test('exportDefaults returns export metadata', async () => {
    const metadata = { fileName: '20240101_baseline.sql', tableCount: 2 };
    const exportStub = mock.fn(async () => metadata);
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      exportTenantTableDefaults: exportStub,
    });
    const req = {
      body: { versionName: 'Baseline' },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.exportDefaults(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 200);
    assert.equal(exportStub.mock.calls.length, 1);
    assert.deepEqual(exportStub.mock.calls[0].arguments, ['Baseline', 5]);
    assert.equal(res.body, metadata);
  });

  test('exportDefaults requires versionName', async () => {
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
    });
    const req = {
      body: {},
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    await mod.exportDefaults(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.message ?? '', /versionName is required/i);
  });

  test('exportDefaults forwards export errors', async () => {
    const failure = new Error('export failed');
    const mod = await loadController({
      getEmploymentSession: async () => ({ permissions: { system_settings: true } }),
      exportTenantTableDefaults: async () => {
        throw failure;
      },
    });
    const req = {
      body: { versionName: 'Baseline' },
      user: { empid: 5, companyId: 1 },
    };
    const res = createRes();
    let captured;
    await mod.exportDefaults(req, res, (err) => {
      captured = err;
    });
    assert.equal(captured, failure);
  });
}
