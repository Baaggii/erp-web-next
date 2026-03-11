import test from 'node:test';
import assert from 'node:assert/strict';
import { processPendingEvents } from '../../api-server/services/eventProcessorService.js';

process.env.EVENT_ENGINE_ENABLED = 'true';

test('event processor marks unmatched events ignored', async () => {
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM core_events')) {
        return [[{
          event_id: 1,
          event_type: 'transaction.updated',
          company_id: 1,
          payload_json: JSON.stringify({}),
          retry_count: 0,
        }]];
      }
      if (sql.includes('SELECT * FROM core_event_policies')) {
        return [[]];
      }
      return [[{ insertId: 1 }]];
    },
  };

  const result = await processPendingEvents({ companyId: 1, conn, limit: 10 });
  assert.equal(result.processed, 1);
  assert.equal(result.ignored, 1);
  assert.ok(calls.some((c) => c.sql.includes("status = 'ignored'")));
});

test('event processor schedules retry on failure with backoff', async () => {
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM core_events')) {
        return [[{ event_id: 9, event_type: 'x', company_id: 1, payload_json: '{}', retry_count: 1 }]];
      }
      if (sql.includes('SELECT * FROM core_event_policies')) {
        return [[{ policy_id: 11, condition_json: { logic: 'and', rules: [{ field: 'eventType', operator: '=', value: 'x' }] }, action_json: { actions: [{ type: 'call_procedure', procedure: 'blocked', allowList: [] }] } }]];
      }
      if (sql.includes('INSERT IGNORE INTO core_event_action_dedup')) {
        return [{ affectedRows: 1 }];
      }
      return [[{ insertId: 1, affectedRows: 1 }]];
    },
  };

  const result = await processPendingEvents({ companyId: 1, conn, limit: 1 });
  assert.equal(result.failed, 1);
  assert.ok(calls.some((entry) => entry.sql.includes('next_retry_at = DATE_ADD')));
});
