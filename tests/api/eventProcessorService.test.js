import test from 'node:test';
import assert from 'node:assert/strict';
import { processPendingEvents } from '../../api-server/services/eventProcessorService.js';

test('event processor marks unmatched events ignored', async () => {
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT event_engine_enabled FROM settings')) return [[{ event_engine_enabled: 1 }]];
      if (sql.includes('SELECT * FROM core_events')) {
        return [[{ event_id: 1, event_type: 'transaction.updated', company_id: 1, payload_json: '{}' }]];
      }
      if (sql.includes('SELECT * FROM core_event_policies')) return [[]];
      return [[{ insertId: 1 }]];
    },
    async getConnection() { return this; },
  };

  const result = await processPendingEvents({ companyId: 1, conn, limit: 10 });
  assert.equal(result.processed, 1);
  assert.equal(result.ignored, 1);
  assert.ok(calls.some((c) => c.sql.includes("status='processing'")));
});

test('event processor avoids duplicate run ids for same node', async () => {
  const inserted = [];
  const conn = {
    async query(sql) {
      if (sql.includes('SELECT event_engine_enabled FROM settings')) return [[{ event_engine_enabled: 1 }]];
      if (sql.includes('SELECT * FROM core_events')) return [[{ event_id: 10, event_type: 'transaction.created', company_id: 1, payload_json: '{"amount":50}' }]];
      if (sql.includes('SELECT * FROM core_event_policies')) return [[{ policy_id: 5, event_type: 'transaction.created', company_id: 1, stop_on_match: 0, condition_json: '{}', action_json: '{"actions":[]}', graph_json: '{"nodes":[{"id":"node_t","type":"trigger","nextIds":["node_a"],"properties":{}},{"id":"node_a","type":"action","nextIds":[],"properties":{"type":"notify"}}]}' }]];
      if (sql.includes('SELECT id FROM core_event_policy_runs')) return [[{ id: 1 }]];
      if (sql.includes('INSERT INTO core_event_policy_runs')) inserted.push(sql);
      return [[{ insertId: 1 }]];
    },
    async getConnection() { return this; },
  };

  const result = await processPendingEvents({ companyId: 1, conn, limit: 1 });
  assert.equal(result.processed, 1);
  assert.equal(inserted.length, 0);
});
