import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

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
    zeroSharedTenantKeys: async () => {},
    seedDefaultsForSeedTables: async () => {},
    seedTenantTables: async () => ({}),
    listCompanies: async () => [],
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

  test('seedCompany returns summary payload', async () => {
    const summary = { posts: { count: 2, ids: ['1', '2'] } };
    const seedStub = mock.fn(async () => summary);
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
    assert.deepEqual(res.body, summary);
    assert.equal(seedStub.mock.calls.length, 1);
    assert.deepEqual(seedStub.mock.calls[0].arguments, [8, ['posts'], {}, false, 5]);
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
    assert.deepEqual(seedStub.mock.calls[0].arguments, [10, ['posts'], { posts: [3, 4] }, true, 5]);
    assert.deepEqual(seedStub.mock.calls[1].arguments, [12, ['posts'], { posts: [3, 4] }, true, 5]);
  });
}
