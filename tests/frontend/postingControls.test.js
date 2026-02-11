import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNonFinancialRow,
  isPostedStatus,
  isPostingSourceTable,
} from '../../src/erp.mgt.mn/utils/postingControls.js';

test('postingControls helpers detect posting tables and statuses', () => {
  assert.equal(isPostingSourceTable('transactions_income'), true);
  assert.equal(isPostingSourceTable('transactions_pos'), true);
  assert.equal(isPostingSourceTable('users'), false);

  assert.equal(isPostedStatus('POSTED'), true);
  assert.equal(isPostedStatus('posted'), true);
  assert.equal(isPostedStatus('DRAFT'), false);

  assert.equal(isNonFinancialRow({ fin_flag_set_code: 'FS_NON_FINANCIAL' }), true);
  assert.equal(isNonFinancialRow({ fin_flag_set_code: 'FS_GL' }), false);
});
