import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTemporaryPromotionOptions } from '../../src/erp.mgt.mn/utils/temporaryPromotionOptions.js';

test('computeTemporaryPromotionOptions forces promotion when posting with a senior in the chain', () => {
  const result = computeTemporaryPromotionOptions({
    requestType: 'temporary-promote',
    submitIntent: 'post',
    pendingPromotionHasSeniorAbove: true,
    pendingTemporaryPromotionId: 123,
    canPostTransactions: true,
    forceResolvePendingDrafts: false,
  });

  assert.equal(result.forcePostFromTemporary, true);
  assert.equal(result.forwardingExistingTemporary, false);
  assert.equal(result.promoteAsTemporary, false);
  assert.equal(result.shouldForcePromote, true);
});

test('computeTemporaryPromotionOptions keeps forwarding path when the intent is not a post', () => {
  const result = computeTemporaryPromotionOptions({
    requestType: 'temporary-promote',
    submitIntent: 'forward',
    pendingPromotionHasSeniorAbove: true,
    pendingTemporaryPromotionId: 'pending-7',
    canPostTransactions: false,
    forceResolvePendingDrafts: true,
  });

  assert.equal(result.forcePostFromTemporary, false);
  assert.equal(result.forwardingExistingTemporary, true);
  assert.equal(result.promoteAsTemporary, true);
  assert.equal(result.shouldForcePromote, true);
});
