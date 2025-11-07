import test from 'node:test';
import assert from 'node:assert/strict';

const origFetch = global.fetch;

function makeResponse(data) {
  return {
    ok: true,
    json: async () => data,
  };
}

test('buildOptionsForRows resolves chained coding table labels', async (t) => {
  const calls = [];
  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    calls.push(url);
    if (url === '/api/tables/items/relations') {
      return makeResponse([
        {
          COLUMN_NAME: 'coding_id',
          REFERENCED_TABLE_NAME: 'coding_table',
          REFERENCED_COLUMN_NAME: 'id',
        },
      ]);
    }
    if (url.startsWith('/api/display_fields?table=coding_table')) {
      return makeResponse({ idField: 'code', displayFields: ['text'] });
    }
    if (url === '/api/tenant_tables/coding_table') {
      return makeResponse({ tenantKeys: ['company_id'] });
    }
    if (url.startsWith('/api/tables/coding_table?')) {
      return makeResponse({
        rows: [
          { id: 'A1', code: 'A1', text: 'Category Alpha' },
        ],
        count: 1,
      });
    }
    if (url.startsWith('/api/tables/items?')) {
      return makeResponse({ rows: [], count: 0 });
    }
    return makeResponse({});
  };

  const { buildOptionsForRows, __clearAsyncSelectOptionCaches } = await import(
    '../../src/erp.mgt.mn/utils/buildAsyncSelectOptions.js'
  );

  try {
    __clearAsyncSelectOptionCaches();
    const options = await buildOptionsForRows({
      table: 'items',
      rows: [{ id: 1, coding_id: 'A1' }],
      idField: 'id',
      searchColumn: 'id',
      labelFields: ['coding_id'],
      companyId: 99,
    });
    assert.deepEqual(options, [
      { value: 1, label: '1 - A1 - Category Alpha' },
    ]);
    assert.ok(
      calls.some((url) => url.startsWith('/api/tables/coding_table?')),
      'expected nested coding table fetch',
    );
  } finally {
    __clearAsyncSelectOptionCaches();
    global.fetch = origFetch;
  }
});
