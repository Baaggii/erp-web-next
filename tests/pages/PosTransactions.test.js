import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('shouldLoadRelations helper', { skip: true }, () => {});
} else {
  test('shouldLoadRelations helper', async () => {
    const { shouldLoadRelations } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const fc1 = { viewSource: {} };
    const cols1 = [{ name: 'id' }, { name: 'name' }];
    assert.equal(shouldLoadRelations(fc1, cols1), false);

    const fc2 = { viewSource: { a: 'viewA' } };
    assert.equal(shouldLoadRelations(fc2, []), true);

    const fc3 = { viewSource: {} };
    const cols3 = [{ name: 'col', REFERENCED_TABLE_NAME: 'ref_tbl' }];
    assert.equal(shouldLoadRelations(fc3, cols3), true);
  });
}
