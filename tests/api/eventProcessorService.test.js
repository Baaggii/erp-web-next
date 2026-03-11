import test from 'node:test';
import assert from 'node:assert/strict';
import { processPendingEvents } from '../../api-server/services/eventProcessorService.js';

test('event processor marks unmatched events ignored', async () => {
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT event_engine_enabled FROM settings LIMIT 1')) {
        return [[{ event_engine_enabled: 1 }]];
      }
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
  assert.ok(calls.some((c) => c.sql.includes("status = 'ignored'")));
});
