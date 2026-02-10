import test from 'node:test';
import assert from 'node:assert/strict';
import { getNotificationsFeed } from '../../api-server/services/notificationsFeed.js';
import * as db from '../../db/index.js';

await test('getNotificationsFeed merges transaction and requests with unread counts', async () => {
  const origQuery = db.pool.query;
  let callIndex = 0;
  db.pool.query = async () => {
    callIndex += 1;
    if (callIndex === 1) {
      return [[
        {
          notification_id: 91,
          message: JSON.stringify({ kind: 'transaction', transactionName: 'Sales', action: 'edited' }),
          is_read: 0,
          created_at: '2024-01-01 09:00:00',
          updated_at: '2024-01-01 09:01:00',
        },
      ]];
    }
    return [[
      {
        request_id: 11,
        request_type: 'report_approval',
        status: 'pending',
        emp_id: 'E2',
        senior_empid: 'S1',
        response_empid: null,
        created_at: '2024-01-01 09:02:00',
        responded_at: null,
        updated_at: '2024-01-01 09:02:00',
      },
      {
        request_id: 12,
        request_type: 'edit',
        status: 'accepted',
        emp_id: 'S1',
        senior_empid: 'M1',
        response_empid: 'M1',
        created_at: '2024-01-01 08:00:00',
        responded_at: '2024-01-01 08:30:00',
        updated_at: '2024-01-01 08:30:00',
      },
    ]];
  };

  try {
    const result = await getNotificationsFeed({ empId: 's1', companyId: 7, limit: 20 });
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].source, 'incoming');
    assert.equal(result.items[1].source, 'transaction');
    assert.equal(result.unreadCountBySource.transaction, 1);
    assert.equal(result.unreadCountBySource.incoming, 1);
    assert.equal(result.unreadCountBySource.outgoing, 0);
    assert.equal(result.nextCursor, null);
  } finally {
    db.pool.query = origQuery;
  }
});
