import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTableRow,
  __setGetTableRowByIdForTest,
} from '../../api-server/controllers/tableController.js';

function createRes() {
  return {
    code: undefined,
    body: undefined,
    locals: {},
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
    sendStatus(c) {
      this.code = c;
    },
  };
}

test('GET /api/tables/:table/:id normalizes tenant filter keys', async () => {
  let capturedOptions;
  __setGetTableRowByIdForTest(async (table, id, options) => {
    capturedOptions = options;
    return { id };
  });
  const req = {
    params: { table: 'foo', id: '123' },
    query: { CompanyID: '77' },
    user: { companyId: '11' },
    on() {},
  };
  const res = createRes();
  await getTableRow(req, res, () => {});
  assert.ok(capturedOptions);
  assert.equal(capturedOptions.tenantFilters.company_id, '77');
  assert.deepEqual(res.body, { id: '123' });
  __setGetTableRowByIdForTest(null);
});
