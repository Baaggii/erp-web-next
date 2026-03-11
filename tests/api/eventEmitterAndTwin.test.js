import test from 'node:test';
import assert from 'node:assert/strict';
import { emitCanonicalEvent } from '../../api-server/services/eventEmitterService.js';
import { listTwinState } from '../../api-server/services/twinStateService.js';
import { tenantHasPolicies, __internal as fastCheckInternal } from '../../api-server/services/eventEngineFastCheck.js';

test('emitCanonicalEvent writes canonical transaction event', async () => {
  const originalFallback = process.env.EVENT_FAST_FALLBACK_ENABLED;
  process.env.EVENT_FAST_FALLBACK_ENABLED = 'false';
  let seen = null;
  const conn = {
    async query(sql, params) {
      seen = { sql, params };
      return [{ insertId: 501 }];
    },
  };
  try {
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
  } finally {
    if (originalFallback === undefined) delete process.env.EVENT_FAST_FALLBACK_ENABLED;
    else process.env.EVENT_FAST_FALLBACK_ENABLED = originalFallback;
  }
});

test('emitCanonicalEvent fast-fallback returns null when tenant has no active policies', async () => {
  delete process.env.EVENT_FAST_FALLBACK_ENABLED;
  let calls = 0;
  const conn = {
    async query(sql) {
      calls += 1;
      if (sql.includes('FROM core_event_policies')) return [[]];
      if (sql.includes('FROM core_events')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const result = await emitCanonicalEvent({ companyId: 77, eventType: 'transaction.updated' }, conn);

  assert.equal(result, null);
  assert.equal(calls, 2);
});

test('tenantHasPolicies uses TTL cache and avoids repeated database calls', async () => {
  fastCheckInternal.policyCache.clear();
  let calls = 0;
  const conn = {
    async query() {
      calls += 1;
      return [[{ 1: 1 }]];
    },
  };

  const first = await tenantHasPolicies(91, conn);
  const second = await tenantHasPolicies(91, conn);

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(calls, 1);
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
