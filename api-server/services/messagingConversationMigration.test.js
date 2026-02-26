import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../../db/migrations/2026-02-26_messaging_strict_conversation_table.sql', import.meta.url);

test('strict conversation migration creates conversation table and enforces FK guards', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS erp_conversations/);
  assert.match(sql, /erp_message_conversation_repair_report/);
  assert.match(sql, /FOREIGN KEY \(conversation_id\) REFERENCES erp_conversations\(id\)/);
  assert.match(sql, /idx_erp_messages_company_conversation_id_desc/);
  assert.match(sql, /CONVERSATION_IMMUTABLE/);
  assert.match(sql, /CONVERSATION_MISMATCH/);
});
