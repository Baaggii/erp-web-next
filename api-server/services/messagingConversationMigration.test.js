import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../../db/migrations/2026-02-26_messaging_strict_conversation_table.sql', import.meta.url);

test('strict conversation migration creates normalized conversation schema', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE erp_conversations/);
  assert.match(sql, /type ENUM\('general','private','linked'\)/);
  assert.match(sql, /CREATE TABLE erp_conversation_participants/);
  assert.match(sql, /PRIMARY KEY \(conversation_id, empid\)/);
  assert.match(sql, /CREATE TABLE erp_messages/);
  assert.match(sql, /message_class ENUM\('general','financial','hr_sensitive','legal'\)/);
  assert.doesNotMatch(sql, /visibility_scope/);
  assert.doesNotMatch(sql, /visibility_empid/);
});
