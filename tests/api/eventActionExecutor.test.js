import test from 'node:test';
import assert from 'node:assert/strict';
import { executePolicyActions } from '../../api-server/services/eventActionExecutor.js';

function makeConn() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return [{ insertId: 77 }];
    },
  };
}

test('event action executor handles create_transaction + notify + update_twin', async () => {
  const conn = makeConn();
  const policy = {
    action_json: {
      actions: [
        {
          type: 'create_transaction',
          transactionType: 'plan_investigation',
          tableName: 'transactions_plan_investigation',
          mapping: { linked_record_id: 'source.recordId', priority: 'payload.severity' },
        },
        {
          type: 'notify',
          target: { mode: 'empids', values: ['e101'] },
          message: 'hello',
        },
        {
          type: 'update_twin',
          twin: 'risk_state',
          mapping: {
            risk_key: 'inventory_shortage',
            entity_type: 'inventory_item',
            entity_ref_id: 'payload.itemId',
            severity: 'payload.severity',
            status_code: 'open',
          },
        },
      ],
    },
  };

  const createdRows = [];
  const event = {
    eventId: 123,
    eventType: 'inventory.shortage.detected',
    actorEmpid: 'E102',
    source: { recordId: 'TX-1' },
    payload: { itemId: 'SKU-001', severity: 'high' },
  };

  const results = await executePolicyActions({
    event,
    policy,
    companyId: 2,
    conn,
    adapters: {
      createTransaction: async (tableName, row) => {
        createdRows.push({ tableName, row });
        return { id: 99 };
      },
    },
  });

  assert.equal(results.length, 3);
  assert.equal(createdRows[0].tableName, 'transactions_plan_investigation');
  assert.equal(createdRows[0].row.linked_record_id, 'TX-1');
  assert.equal(createdRows[0].row.company_id, 2);
  assert.ok(conn.calls.some((entry) => entry.sql.includes('INSERT INTO notifications')));
  assert.ok(conn.calls.some((entry) => entry.sql.includes('INSERT INTO `twin_risk_state`')));
});
