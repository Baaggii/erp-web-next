import test from 'node:test';
import assert from 'node:assert/strict';
import {
  notifyUser,
  setNotificationEmitter,
  setNotificationStore,
} from '../../api-server/services/notificationService.js';

test('notifyUser normalizes recipient room and payload to uppercase', async () => {
  const dbCalls = [];
  const emitted = [];

  setNotificationStore({
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return [{ insertId: 77 }];
    },
  });
  setNotificationEmitter({
    to: (room) => ({
      emit: (event, payload) => {
        emitted.push({ room, event, payload });
      },
    }),
  });

  await notifyUser({
    companyId: 3,
    recipientEmpId: 'emp-001',
    type: 'request',
    kind: 'temporary',
    message: 'Temporary submission pending review',
    relatedId: 12,
    createdBy: 'EMP999',
  });

  assert.equal(dbCalls.length, 1);
  assert.equal(dbCalls[0].params[1], 'EMP-001');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, 'user:EMP-001');
  assert.equal(emitted[0].event, 'notification:new');
});
