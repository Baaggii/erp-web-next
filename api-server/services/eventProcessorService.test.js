import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

afterEach(() => {
  delete process.env.EVENT_ENGINE_ENABLED;
});

class MockConn {
  constructor({ policies = [] } = {}) {
    this.events = [{
      event_id: 101,
      event_type: 'transaction.created',
      company_id: 1,
      payload_json: '{}',
      source_transaction_type: 'plan',
      source_table: 'transactions_plan',
      source_record_id: '10',
      source_action: 'create',
      status: 'pending',
    }];
    this.policies = policies;
    this.policyRuns = [];
    this.deadLetters = [];
    this.eventUpdates = [];
  }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('SELECT event_engine_enabled FROM settings LIMIT 1')) {
      return [[{ event_engine_enabled: 1 }], undefined];
    }
    if (text.startsWith('SELECT * FROM core_events WHERE')) {
      return [this.events, undefined];
    }
    if (text.startsWith("UPDATE core_events SET status='processing'")) {
      this.eventUpdates.push({ stage: 'processing', params });
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('SELECT * FROM core_event_policies')) {
      return [this.policies, undefined];
    }
    if (text.startsWith('INSERT INTO core_event_policy_runs')) {
      this.policyRuns.push(params);
      return [{ insertId: this.policyRuns.length }, undefined];
    }
    if (text.startsWith('SELECT run_id FROM core_event_policy_runs')) {
      return [[], undefined];
    }
    if (text.startsWith('UPDATE core_events SET status =')) {
      this.eventUpdates.push({ stage: 'final', params });
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('UPDATE core_events SET status = \'ignored\'')) {
      this.eventUpdates.push({ stage: 'ignored', params });
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('UPDATE core_events SET status=\'failed\'')) {
      this.eventUpdates.push({ stage: 'failed', params });
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('INSERT INTO core_event_dead_letters')) {
      this.deadLetters.push(params);
      return [{ insertId: this.deadLetters.length }, undefined];
    }

    throw new Error(`Unhandled SQL: ${text}`);
  }
}

test('transaction without events succeeds with zero processed records', async () => {
  const { processPendingEvents } = await import('./eventProcessorService.js');
  const conn = new MockConn();
  conn.events = [];

  const result = await processPendingEvents({ companyId: 1, conn });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 0);
});

test('transaction event with no policy is ignored but succeeds', async () => {
  const { processPendingEvents } = await import('./eventProcessorService.js');
  const conn = new MockConn({ policies: [] });

  const result = await processPendingEvents({ companyId: 1, conn });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.ignored, 1);
  assert.equal(result.events[0].status, 'ignored');
});

test('transaction event with matching policy is processed', async () => {
  const { processPendingEvents } = await import('./eventProcessorService.js');
  const conn = new MockConn({
    policies: [{
      policy_id: 1,
      condition_json: { logic: 'and', rules: [{ field: 'eventType', operator: '=', value: 'transaction.created' }] },
      action_json: { actions: [] },
      stop_on_match: 0,
    }],
  });

  const result = await processPendingEvents({ companyId: 1, conn });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.ignored, 0);
  assert.equal(result.events[0].status, 'processed');
  assert.ok(conn.policyRuns.length >= 2);
});
