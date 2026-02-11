import test from 'node:test';
import assert from 'node:assert/strict';

import { validateJournalRequestBody } from '../../api-server/services/journalRouteValidation.js';

test('validateJournalRequestBody rejects invalid table and source id', () => {
  const badTable = validateJournalRequestBody({ source_table: 'users', source_id: 10 });
  assert.equal(badTable.ok, false);
  assert.match(badTable.message, /Invalid source_table/);

  const badId = validateJournalRequestBody({ source_table: 'transactions_income', source_id: 'abc' });
  assert.equal(badId.ok, false);
  assert.match(badId.message, /source_id/);
});

test('validateJournalRequestBody accepts posting payload with force repost', () => {
  const result = validateJournalRequestBody(
    { source_table: 'transactions_inventory', source_id: '15', force_repost: true },
    { allowForceRepost: true },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    source_table: 'transactions_inventory',
    source_id: 15,
    force_repost: true,
  });
});
