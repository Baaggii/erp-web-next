import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('shouldLoadRelations helper', { skip: true }, () => {});
  test('applySessionIdToTables helper', { skip: true }, () => {});
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

  test('applySessionIdToTables helper', async () => {
    const { applySessionIdToTables } = await mock.import(
      '../../src/erp.mgt.mn/pages/PosTransactions.jsx',
      {},
    );

    const sessionFieldsByTable = {
      master_tbl: ['pos_session_id'],
      detail_tbl: ['session_id'],
    };
    const tableTypeMap = { master_tbl: 'single', detail_tbl: 'multi' };
    const initial = {
      master_tbl: { name: 'Txn' },
      detail_tbl: [
        { line: 1, qty: 2 },
        { line: 2, qty: 1, session_id: 'old_session' },
      ],
    };
    const sid = 'pos_test';

    const populated = applySessionIdToTables(
      initial,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );

    assert.notStrictEqual(populated, initial);
    assert.equal(populated.master_tbl.pos_session_id, sid);
    assert.equal(populated.detail_tbl[0].session_id, sid);
    assert.equal(populated.detail_tbl[1].session_id, sid);
    assert.equal(initial.detail_tbl[1].session_id, 'old_session');

    const secondPass = applySessionIdToTables(
      populated,
      sid,
      sessionFieldsByTable,
      tableTypeMap,
    );
    assert.strictEqual(secondPass, populated);
  });
}
