import test from 'node:test';
import assert from 'node:assert/strict';
import { emitCanonicalEvent } from '../../api-server/services/eventEmitterService.js';
import { listTwinState } from '../../api-server/services/twinStateService.js';

test('emitCanonicalEvent writes canonical transaction event', async () => {
  let seen = null;
  const conn = {
    async query(sql, params) {
      seen = { sql, params };
      return [{ insertId: 501 }];
    },
  };
  const result = await emitCanonicalEvent({
    eventType: 'transaction.created',
    companyId: 5,
    actorEmpid: 'E200',
    source: { table: 'transactions_inventory', recordId: '10', action: 'create' },
    payload: { changedFields: ['qty'] },
  }, conn);

  assert.equal(result.eventId, 501);
  assert.ok(seen.sql.includes('INSERT INTO core_events'));
  assert.equal(seen.params[0], 'transaction.created');
  assert.equal(seen.params[5], 5);
});

test('listTwinState enforces tenant company filter', async () => {
  let captured;
  const conn = {
    async query(sql, params) {
      captured = { sql, params };
      return [[]];
    },
  };
  await listTwinState('risk_state', 9, { severity: 'high' }, conn);
  assert.ok(captured.sql.includes('company_id = ?'));
  assert.deepEqual(captured.params, [9, 'high']);
});
