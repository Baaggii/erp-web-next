import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

const {
  listConversations,
  getConversationMessages,
  postConversationMessage,
} = await import('./messagingService.js');

class ScopedMockDb {
  constructor() {
    this.nextConversationId = 1;
    this.nextMessageId = 1;
    this.conversations = [];
    this.participants = [];
    this.messages = [];
    this.scopeUsers = {
      department: [],
      branch: [],
    };
  }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith("SELECT * FROM erp_conversations WHERE company_id = ? AND type = 'general'")) {
      const [companyId] = params;
      return [[this.conversations.find((c) => c.company_id === Number(companyId) && c.type === 'general' && !c.deleted_at)].filter(Boolean), undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversations (company_id, type, created_by_empid)')) {
      const [companyId, empid] = params;
      const row = { id: this.nextConversationId++, company_id: Number(companyId), type: 'general', linked_type: null, linked_id: null, topic: null, created_by_empid: empid, deleted_at: null, last_message_at: null, last_message_id: null };
      this.conversations.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE company_id = ? AND type = \'linked\'')) {
      const [companyId, linkedType, linkedId] = params;
      const row = this.conversations.find((c) => c.company_id === Number(companyId) && c.type === 'linked' && c.linked_type === linkedType && c.linked_id === linkedId && !c.deleted_at);
      return [[row].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT name FROM code_department')) {
      return [[{ name: 'HR Department' }], undefined];
    }
    if (text.startsWith('SELECT name FROM code_branches')) {
      return [[{ name: 'Ulaanbaatar Branch' }], undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversations (company_id, type, topic, linked_type, linked_id, created_by_empid)')) {
      const [companyId, topic, linkedType, linkedId, empid] = params;
      const row = { id: this.nextConversationId++, company_id: Number(companyId), type: 'linked', linked_type: linkedType, linked_id: linkedId, topic, created_by_empid: empid, deleted_at: null, last_message_at: null, last_message_id: null };
      this.conversations.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE id = ? LIMIT 1')) {
      const [id] = params;
      return [[this.conversations.find((c) => c.id === Number(id))].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT * FROM erp_conversations WHERE id = ? AND company_id = ?')) {
      const [id, companyId] = params;
      return [[this.conversations.find((c) => c.id === Number(id) && c.company_id === Number(companyId) && !c.deleted_at)].filter(Boolean), undefined];
    }

    if (text.startsWith('SELECT empid FROM erp_conversation_participants')) {
      const [companyId, conversationId] = params;
      return [this.participants.filter((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && !p.left_at).map((p) => ({ empid: p.empid })), undefined];
    }
    if (text.startsWith('INSERT INTO erp_conversation_participants')) {
      const [conversationId, companyId, empid, joinedAt] = params;
      const existing = this.participants.find((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && p.empid === empid);
      if (existing) {
        existing.left_at = null;
        const incoming = joinedAt || existing.joined_at;
        existing.joined_at = existing.joined_at && incoming ? (existing.joined_at < incoming ? existing.joined_at : incoming) : (incoming || existing.joined_at);
      } else {
        this.participants.push({ company_id: Number(companyId), conversation_id: Number(conversationId), empid, joined_at: joinedAt || '2026-01-01 00:00:00', left_at: null });
      }
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('SELECT u.empid, COALESCE(e.employment_date')) {
      const scopeType = text.includes('employment_department_id') ? 'department' : 'branch';
      return [this.scopeUsers[scopeType], undefined];
    }

    if (text.startsWith('SELECT c.*, lm.body AS last_message_body')) {
      const [companyId, empid, maybeLimit, maybeLimit2] = params;
      const limit = Number(maybeLimit2 ?? maybeLimit);
      const rows = this.conversations
        .filter((c) => c.company_id === Number(companyId) && !c.deleted_at)
        .filter((c) => c.type === 'general' || this.participants.some((p) => p.company_id === c.company_id && p.conversation_id === c.id && p.empid === empid && !p.left_at))
        .sort((a, b) => {
          const aPinned = a.type === 'general' || (a.type === 'linked' && ['department', 'branch'].includes(a.linked_type));
          const bPinned = b.type === 'general' || (b.type === 'linked' && ['department', 'branch'].includes(b.linked_type));
          if (aPinned !== bPinned) return Number(bPinned) - Number(aPinned);
          return b.id - a.id;
        })
        .slice(0, limit)
        .map((c) => ({ ...c, participant_empids: this.participants.filter((p) => p.conversation_id === c.id && !p.left_at).map((p) => p.empid).join(',') }));
      return [rows, undefined];
    }

    if (text.startsWith('SELECT 1 FROM erp_conversation_participants')) {
      const [companyId, conversationId, empid] = params;
      const found = this.participants.find((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && p.empid === empid && !p.left_at);
      return [[found ? { 1: 1 } : null].filter(Boolean), undefined];
    }
    if (text.startsWith('SELECT joined_at FROM erp_conversation_participants')) {
      const [companyId, conversationId, empid] = params;
      const row = this.participants.find((p) => p.company_id === Number(companyId) && p.conversation_id === Number(conversationId) && p.empid === empid && !p.left_at);
      return [[row ? { joined_at: row.joined_at } : null].filter(Boolean), undefined];
    }

    if (text.startsWith('INSERT INTO erp_messages')) {
      const [companyId, conversationId, authorEmpid, parentMessageId, body, messageClass] = params;
      const row = { id: this.nextMessageId++, company_id: Number(companyId), conversation_id: Number(conversationId), author_empid: authorEmpid, parent_message_id: parentMessageId ? Number(parentMessageId) : null, body, message_class: messageClass, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), deleted_at: null };
      this.messages.push(row);
      return [{ insertId: row.id }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE id = ? LIMIT 1')) {
      const [id] = params;
      return [[this.messages.find((m) => m.id === Number(id))].filter(Boolean), undefined];
    }
    if (text.startsWith('UPDATE erp_conversations SET last_message_id = ?')) {
      const [messageId, createdAt, conversationId] = params;
      const row = this.conversations.find((c) => c.id === Number(conversationId));
      if (row) {
        row.last_message_id = Number(messageId);
        row.last_message_at = createdAt;
      }
      return [{ affectedRows: 1 }, undefined];
    }
    if (text.startsWith('SELECT * FROM erp_messages WHERE company_id = ? AND conversation_id = ?')) {
      const [companyId, conversationId] = params;
      const joinedAt = text.includes('created_at >= ?') ? params[2] : null;
      const rows = this.messages
        .filter((m) => m.company_id === Number(companyId) && m.conversation_id === Number(conversationId) && !m.deleted_at)
        .filter((m) => (joinedAt ? m.created_at >= joinedAt : true))
        .sort((a, b) => b.id - a.id)
        .slice(0, Number(params[params.length - 1]));
      return [rows, undefined];
    }
    if (text.startsWith('INSERT IGNORE INTO erp_message_reads')) return [{ affectedRows: 0 }, undefined];
    if (text.startsWith('SELECT message_id, empid FROM erp_message_reads')) return [[], undefined];
    if (text.startsWith('SELECT message_id, emoji, empid FROM erp_message_reactions')) return [[], undefined];

    throw new Error(`Unhandled SQL: ${text}`);
  }
}

test('listConversations creates pinned department/branch channels and welcome messages', async () => {
  const db = new ScopedMockDb();
  db.scopeUsers.department = [
    { empid: 'E1', hire_date: '2026-01-01' },
    { empid: 'E2', hire_date: '2026-02-01' },
  ];
  db.scopeUsers.branch = [
    { empid: 'E1', hire_date: '2026-01-01' },
    { empid: 'E3', hire_date: '2026-03-01' },
  ];

  const getSession = async () => ({ permissions: { messaging: true }, department_id: 10, department_name: 'HR', branch_id: 20, branch_name: 'Ulaanbaatar' });
  const result = await listConversations({ user: { empid: 'E1', companyId: 5 }, companyId: 5, db, getSession });

  assert.equal(result.items.some((entry) => entry.type === 'general'), true);
  assert.equal(result.items.some((entry) => entry.linked_type === 'department'), true);
  assert.equal(result.items.some((entry) => entry.linked_type === 'branch'), true);
  assert.equal(db.messages.some((message) => String(message.body || '').startsWith('Welcome ')), true);
  const createdDept = db.conversations.find((entry) => entry.linked_type === 'department');
  const createdBranch = db.conversations.find((entry) => entry.linked_type === 'branch');
  assert.equal(createdDept?.topic, 'HR Department');
  assert.equal(createdBranch?.topic, 'Ulaanbaatar Branch');
});

test('department and branch channels only return messages from participant joined_at time', async () => {
  const db = new ScopedMockDb();
  const getSession = async () => ({ permissions: { messaging: true }, department_id: 10, branch_id: 20 });

  db.conversations.push({ id: 99, company_id: 6, type: 'linked', linked_type: 'department', linked_id: '10', created_by_empid: 'E1', deleted_at: null });
  db.participants.push({ company_id: 6, conversation_id: 99, empid: 'E4', joined_at: '2026-02-15 00:00:00', left_at: null });
  db.messages.push({ id: 1, company_id: 6, conversation_id: 99, author_empid: 'E1', body: 'old', message_class: 'general', created_at: '2026-02-10 00:00:00', deleted_at: null });
  db.messages.push({ id: 2, company_id: 6, conversation_id: 99, author_empid: 'E1', body: 'new', message_class: 'general', created_at: '2026-02-20 00:00:00', deleted_at: null });

  const thread = await getConversationMessages({ user: { empid: 'E4', companyId: 6 }, companyId: 6, conversationId: 99, db, getSession });
  assert.deepEqual(thread.items.map((entry) => entry.body), ['new']);

  await postConversationMessage({ user: { empid: 'E4', companyId: 6 }, companyId: 6, conversationId: 99, db, getSession, payload: { body: 'post-hire' } });
  const threadAfterPost = await getConversationMessages({ user: { empid: 'E4', companyId: 6 }, companyId: 6, conversationId: 99, db, getSession });
  assert.equal(threadAfterPost.items.some((entry) => entry.body === 'post-hire'), true);
});


test('listConversations keeps scoped channels visible for actor even when scope sync returns no rows', async () => {
  const db = new ScopedMockDb();
  const getSession = async () => ({ permissions: { messaging: true }, department_id: 12, branch_id: 22 });

  const result = await listConversations({ user: { empid: 'ACT1', companyId: 9 }, companyId: 9, db, getSession });

  assert.equal(result.items.some((entry) => entry.linked_type === 'department'), true);
  assert.equal(result.items.some((entry) => entry.linked_type === 'branch'), true);
  const deptConversation = db.conversations.find((entry) => entry.linked_type === 'department');
  const branchConversation = db.conversations.find((entry) => entry.linked_type === 'branch');
  assert.equal(db.participants.some((p) => p.conversation_id === deptConversation?.id && p.empid === 'ACT1' && !p.left_at), true);
  assert.equal(db.participants.some((p) => p.conversation_id === branchConversation?.id && p.empid === 'ACT1' && !p.left_at), true);
});
