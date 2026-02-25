import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../../db/migrations/2026-02-25_messaging_conversation_identity_enforcement.sql', import.meta.url);

test('conversation identity migration backfills missing conversation_id and reports unresolved rows', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /erp_message_conversation_backfill_report/);
  assert.match(sql, /UPDATE erp_messages\s+SET conversation_id = id\s+WHERE parent_message_id IS NULL/);
  assert.match(sql, /PARENT_NOT_FOUND|AMBIGUOUS_CONVERSATION/);
  assert.match(sql, /MODIFY COLUMN conversation_id BIGINT UNSIGNED NOT NULL/);
});
