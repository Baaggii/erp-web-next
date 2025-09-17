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
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
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
    seedTenantTables: async () => {},
    listCompanies: async () => [],
    ...overrides,
  };
  const mod = await mock.import(
    '../../api-server/controllers/tenantTablesController.js',
    {
      '../../db/index.js': baseDb,
    },
  );
  return mod.getTenantTable;
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
    const getTenantTable = await loadController({ getTenantTable: stub });
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
    const getTenantTable = await loadController();
    await getTenantTable(req, res, (err) => {
      if (err) throw err;
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.message, 'table_name is required');
  });

  test('getTenantTable returns 404 when table not found', async () => {
    const req = { params: { table_name: 'missing' } };
    const res = createRes();
    const getTenantTable = await loadController({ getTenantTable: async () => null });
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
    const getTenantTable = await loadController({
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
}
