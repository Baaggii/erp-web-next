import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

const { hasMatchingPolicies, invalidateEventPolicyMatchFastCheck } = await import('./eventPolicyMatchFastCheck.js');

afterEach(() => {
  delete process.env.NODE_ENV;
  invalidateEventPolicyMatchFastCheck();
});

function makeConn(policies) {
  return {
    async query(sql, params = []) {
      const [companyId, eventType, sourceTable, sourceTransactionType, sourceTransactionCode] = params;
      const includeSamples = !String(sql).includes('is_sample = 0');
      const rows = policies.filter((policy) => {
        if (Number(policy.company_id) !== Number(companyId)) return false;
        if (policy.event_type !== eventType) return false;
        if (!policy.is_active) return false;
        if (policy.deleted_at != null) return false;
        if (!includeSamples && Number(policy.is_sample || 0) === 1) return false;
        if (policy.source_table != null && policy.source_table !== sourceTable) return false;
        if (policy.source_transaction_type != null && policy.source_transaction_type !== sourceTransactionType) return false;
        if (policy.source_transaction_code != null && Number(policy.source_transaction_code) !== Number(sourceTransactionCode)) return false;
        return true;
      }).slice(0, 1).map(() => ({ 1: 1 }));
      return [rows, undefined];
    },
  };
}

test('no matching policy for source table -> event skipped by fast check', async () => {
  const conn = makeConn([
    { company_id: 1, event_type: 'transaction.created', is_active: 1, deleted_at: null, source_table: 'transactions_sales' },
  ]);

  const matched = await hasMatchingPolicies({
    companyId: 1,
    eventType: 'transaction.created',
    sourceTable: 'transactions_purchase',
    sourceTransactionType: 'purchase',
    sourceTransactionCode: null,
    conn,
  });

  assert.equal(matched, false);
});

test('policy exists for other table -> fast check stays false', async () => {
  const conn = makeConn([
    { company_id: 7, event_type: 'transaction.updated', is_active: 1, deleted_at: null, source_table: 'transactions_plan' },
  ]);

  const matched = await hasMatchingPolicies({
    companyId: 7,
    eventType: 'transaction.updated',
    sourceTable: 'transactions_finance',
    sourceTransactionType: 'finance',
    sourceTransactionCode: 22,
    conn,
  });

  assert.equal(matched, false);
});

test('policy exists for same event_type and source table -> event emitted', async () => {
  const conn = makeConn([
    { company_id: 1, event_type: 'transaction.created', is_active: 1, deleted_at: null, source_table: 'transactions_plan', source_transaction_type: 'plan' },
  ]);

  const matched = await hasMatchingPolicies({
    companyId: 1,
    eventType: 'transaction.created',
    sourceTable: 'transactions_plan',
    sourceTransactionType: 'plan',
    sourceTransactionCode: null,
    conn,
  });

  assert.equal(matched, true);
});

test('sample policy in production is ignored', async () => {
  process.env.NODE_ENV = 'production';
  const conn = makeConn([
    { company_id: 1, event_type: 'journal.posted', is_active: 1, is_sample: 1, deleted_at: null, source_table: null },
  ]);

  const matched = await hasMatchingPolicies({
    companyId: 1,
    eventType: 'journal.posted',
    sourceTable: null,
    sourceTransactionType: null,
    sourceTransactionCode: null,
    conn,
  });

  assert.equal(matched, false);
});

test('generic policy with null source fields still matches tenant-wide event type', async () => {
  const conn = makeConn([
    { company_id: 3, event_type: 'transaction.deleted', is_active: 1, deleted_at: null, source_table: null, source_transaction_type: null, source_transaction_code: null },
  ]);

  const matched = await hasMatchingPolicies({
    companyId: 3,
    eventType: 'transaction.deleted',
    sourceTable: 'transactions_anything',
    sourceTransactionType: 'anything',
    sourceTransactionCode: 999,
    conn,
  });

  assert.equal(matched, true);
});
