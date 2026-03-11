import test from 'node:test';
import assert from 'node:assert/strict';
import { processPendingEvents, processEventById } from '../../api-server/services/eventProcessorService.js';

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
  assert.ok(calls.some((c) => c.sql.includes("status = ?")));
});


test('processEventById processes the requested event id', async () => {
  const calls = [];
  const conn = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('WHERE event_id = ? AND company_id = ?') && sql.includes('LIMIT 1')) {
        return [[{
          event_id: Number(params[0]),
          event_type: 'transaction.updated',
          company_id: Number(params[1]),
          payload_json: JSON.stringify({}),
        }]];
      }
      if (sql.includes('SELECT * FROM core_event_policies')) {
        return [[]];
      }
      return [[{ insertId: 1 }]];
    },
  };

  const result = await processEventById({ eventId: 987, companyId: 3, conn });
  assert.equal(result.events[0].eventId, 987);
  assert.equal(result.events[0].status, 'ignored');
});
