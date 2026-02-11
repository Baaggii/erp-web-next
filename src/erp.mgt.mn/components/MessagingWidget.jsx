import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

function normalizeId(value) {
  return String(value ?? '').trim();
}

function normalizeUserRecord(user, onlineSet) {
  const empid = normalizeId(user?.empid ?? user?.emp_id ?? user?.id);
  if (!empid) return null;
  const name =
    String(
      user?.employee_name ?? user?.name ?? user?.full_name ?? user?.displayName ?? empid,
    ).trim() || empid;
  return {
    empid,
    name,
    online: onlineSet.has(empid),
  };
}

function extractMessageParticipants(msg) {
  const fields = [
    msg?.recipient_empids,
    msg?.recipientEmpids,
    msg?.participants,
    msg?.participant_empids,
    msg?.participantEmpids,
    msg?.to_empids,
    msg?.toEmpids,
  ];
  const ids = new Set();
  fields.forEach((field) => {
    if (!field) return;
    if (Array.isArray(field)) {
      field.forEach((id) => {
        const normalized = normalizeId(id);
        if (normalized) ids.add(normalized);
      });
      return;
    }
    if (typeof field === 'string') {
      const trimmed = field.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            parsed.forEach((id) => {
              const normalized = normalizeId(id);
              if (normalized) ids.add(normalized);
            });
            return;
          }
        } catch {
          // ignore malformed json
        }
      }
      trimmed.split(',').forEach((id) => {
        const normalized = normalizeId(id);
        if (normalized) ids.add(normalized);
      });
    }
  });
  const author = normalizeId(msg?.author_empid ?? msg?.authorEmpid);
  if (author) ids.add(author);
  return Array.from(ids);
}

function buildThreads(messages) {
  const byId = new Map(messages.map((msg) => [msg.id, { ...msg, replies: [] }]));
  const roots = [];
  byId.forEach((msg) => {
    if (msg.parent_message_id && byId.has(msg.parent_message_id)) {
      byId.get(msg.parent_message_id).replies.push(msg);
    } else {
      roots.push(msg);
    }
  });
  const sortByCreatedAt = (list) =>
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const sortRecursively = (node) => {
    sortByCreatedAt(node.replies);
    node.replies.forEach(sortRecursively);
  };
  sortByCreatedAt(roots);
  roots.forEach(sortRecursively);
  return roots;
}

function inferConversationKey(msg) {
  const topic = String(msg?.topic || '').trim();
  if (topic) return `topic:${topic.toLowerCase()}`;
  const participants = extractMessageParticipants(msg).sort().join(',');
  if (participants) return `users:${participants}`;
  return 'general';
}

function groupConversations(messages) {
  const map = new Map();
  messages.forEach((msg) => {
    const key = inferConversationKey(msg);
    if (!map.has(key)) {
      map.set(key, {
        key,
        topic: String(msg?.topic || '').trim(),
        participantIds: new Set(),
        messages: [],
        updatedAt: msg?.created_at,
      });
    }
    const conversation = map.get(key);
    conversation.messages.push(msg);
    extractMessageParticipants(msg).forEach((id) => conversation.participantIds.add(id));
    if (!conversation.topic && msg?.topic) {
      conversation.topic = String(msg.topic).trim();
    }
    if (
      msg?.created_at &&
      (!conversation.updatedAt ||
        new Date(msg.created_at).getTime() > new Date(conversation.updatedAt).getTime())
    ) {
      conversation.updatedAt = msg.created_at;
    }
  });
  return Array.from(map.values())
    .map((entry) => ({ ...entry, participantIds: Array.from(entry.participantIds) }))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

function MessageNode({ msg, onReply, highlightedParentId }) {
  return (
    <div
      style={{
        borderLeft: '2px solid #e5e7eb',
        marginLeft: '0.5rem',
        paddingLeft: '0.5rem',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
        {msg.author_empid} • {new Date(msg.created_at).toLocaleString()}
      </div>
      <div
        style={{
          whiteSpace: 'pre-wrap',
          background: Number(highlightedParentId) === Number(msg.parent_message_id) ? '#fef3c7' : 'transparent',
          borderRadius: 4,
          padding: '0.1rem 0.2rem',
        }}
      >
        {msg.body}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#4b5563' }}>
        {msg.transaction_id && <span>txn: {msg.transaction_id}</span>}
        {msg.plan_id && <span>plan: {msg.plan_id}</span>}
        {msg.topic && <span>topic: {msg.topic}</span>}
      </div>
      <button style={{ fontSize: '0.75rem' }} onClick={() => onReply(msg.id)}>
        Reply
      </button>
      {msg.replies?.map((reply) => (
        <MessageNode key={reply.id} msg={reply} onReply={onReply} highlightedParentId={highlightedParentId} />
      ))}
    </div>
  );
}

export default function MessagingWidget() {
  const { session, company, user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [activeConversationKey, setActiveConversationKey] = useState('new');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [transactionDraft, setTransactionDraft] = useState(null);
  const [planId, setPlanId] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedParentId, setHighlightedParentId] = useState(null);

  const companyId = company ?? session?.company_id ?? session?.companyId;
  const selfEmpId = normalizeId(user?.empid);

  const reload = async () => {
    if (!companyId) return;
    const params = new URLSearchParams({ companyId: String(companyId), limit: '200' });
    const res = await fetch(`${API_BASE}/messaging?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setOnlineUsers(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
  };

  useEffect(() => {
    reload();
  }, [companyId]);

  useEffect(() => {
    const handleStart = (event) => {
      const detail = event?.detail || {};
      const starterTopic = String(detail.topic || '').trim();
      const incomingUsers = Array.isArray(detail.recipientEmpids)
        ? detail.recipientEmpids.map((id) => normalizeId(id)).filter(Boolean)
        : [];
      setSelectedUsers(new Set(incomingUsers));
      setTopic(starterTopic);
      setTransactionDraft(detail.transaction || null);
      setActiveConversationKey('new');
      setOpen(true);
    };
    window.addEventListener('messaging:start', handleStart);
    return () => window.removeEventListener('messaging:start', handleStart);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (next) => {
      setMessages((prev) => [...prev, next]);
      if (Number(next?.parent_message_id) === Number(replyTo)) {
        setHighlightedParentId(next.parent_message_id);
        setTimeout(() => setHighlightedParentId(null), 2000);
      }
    };
    const onPresence = (payload) => {
      if (Number(payload?.companyId) !== Number(companyId)) return;
      setOnlineUsers(Array.isArray(payload?.onlineUsers) ? payload.onlineUsers : []);
    };
    socket.on('messages:new', onNew);
    socket.on('messages:presence', onPresence);
    return () => {
      socket.off('messages:new', onNew);
      socket.off('messages:presence', onPresence);
      disconnectSocket();
    };
  }, [companyId, replyTo]);

  const onlineSet = useMemo(
    () => new Set(onlineUsers.map((u) => normalizeId(u?.empid ?? u?.emp_id ?? u?.id))),
    [onlineUsers],
  );

  const usersDirectory = useMemo(() => {
    const map = new Map();
    onlineUsers.forEach((u) => {
      const normalized = normalizeUserRecord(u, onlineSet);
      if (normalized) map.set(normalized.empid, normalized);
    });
    messages.forEach((msg) => {
      extractMessageParticipants(msg).forEach((empid) => {
        if (!empid) return;
        if (!map.has(empid)) {
          map.set(empid, { empid, name: empid, online: onlineSet.has(empid) });
        }
      });
    });
    if (selfEmpId && !map.has(selfEmpId)) {
      map.set(selfEmpId, { empid: selfEmpId, name: selfEmpId, online: onlineSet.has(selfEmpId) });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [onlineUsers, messages, onlineSet, selfEmpId]);

  const conversations = useMemo(() => groupConversations(messages), [messages]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.key === activeConversationKey) || null,
    [conversations, activeConversationKey],
  );

  const activeMessages = useMemo(() => {
    if (!activeConversation) return [];
    return buildThreads(activeConversation.messages);
  }, [activeConversation]);

  const displayedTopic =
    activeConversationKey === 'new' ? topic : String(activeConversation?.topic || '').trim();

  const participantIds = useMemo(() => {
    if (activeConversationKey === 'new') {
      return Array.from(selectedUsers);
    }
    return activeConversation?.participantIds || [];
  }, [activeConversationKey, selectedUsers, activeConversation]);

  const mentionSuggestions = useMemo(
    () => usersDirectory.filter((entry) => participantIds.includes(entry.empid)),
    [usersDirectory, participantIds],
  );

  const insertMention = (empid) => {
    setBody((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}@${empid} `);
  };

  const toggleSelectedUser = (empid) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(empid)) next.delete(empid);
      else next.add(empid);
      return next;
    });
  };

  const onDropTransaction = (event) => {
    event.preventDefault();
    const textPayload = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
    if (!textPayload) return;
    let parsed = null;
    try {
      parsed = JSON.parse(textPayload);
    } catch {
      parsed = { id: textPayload };
    }
    const id = normalizeId(parsed?.id ?? parsed?.transactionId ?? parsed?.rowId);
    const table = normalizeId(parsed?.table ?? parsed?.tableName);
    const rowId = normalizeId(parsed?.rowId ?? parsed?.id);
    const label = parsed?.label || [table, id || rowId].filter(Boolean).join(' #');
    if (id || rowId || table) {
      setTransactionDraft({ id: id || rowId, table: table || null, rowId: rowId || null, label: label || 'Transaction' });
    }
  };

  const openConversationFromSelection = () => {
    setActiveConversationKey('new');
    setReplyTo(null);
    setBody('');
  };

  const send = async () => {
    const payload = {
      companyId,
      body,
      topic: displayedTopic || null,
      transactionId: transactionDraft?.id || null,
      transactionTable: transactionDraft?.table || null,
      transactionRowId: transactionDraft?.rowId || null,
      planId: planId || null,
      parentMessageId: replyTo || null,
      recipientEmpids: participantIds.filter((id) => id !== selfEmpId),
    };
    const res = await fetch(`${API_BASE}/messaging`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setBody('');
      setReplyTo(null);
      setPlanId('');
      await reload();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: open ? 720 : 220,
        zIndex: 1200,
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 8,
        boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: '#1f2937',
          color: '#fff',
          border: 0,
          borderRadius: '8px 8px 0 0',
          padding: '0.5rem',
          textAlign: 'left',
        }}
      >
        💬 Messages {open ? '▾' : '▸'} {displayedTopic ? `• ${displayedTopic}` : ''}
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 220px 1fr', minHeight: 420 }}>
          <div style={{ borderRight: '1px solid #e5e7eb', padding: '0.5rem', overflow: 'auto' }}>
            <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.4rem' }}>
              Employees
            </div>
            {usersDirectory.map((entry) => (
              <label key={entry.empid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: entry.online ? '#166534' : '#6b7280' }}>
                <input
                  type="checkbox"
                  checked={selectedUsers.has(entry.empid)}
                  onChange={() => toggleSelectedUser(entry.empid)}
                />
                <span>
                  {entry.name} ({entry.empid})
                </span>
              </label>
            ))}
            <button style={{ marginTop: 8, width: '100%' }} onClick={openConversationFromSelection}>
              New message
            </button>
          </div>

          <div style={{ borderRight: '1px solid #e5e7eb', padding: '0.5rem', overflow: 'auto' }}>
            <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.4rem' }}>Topics</div>
            <button
              style={{ width: '100%', marginBottom: 6, background: activeConversationKey === 'new' ? '#e5e7eb' : '#fff' }}
              onClick={() => setActiveConversationKey('new')}
            >
              + New thread {topic ? `(${topic})` : ''}
            </button>
            {conversations.map((conversation) => (
              <button
                key={conversation.key}
                style={{ width: '100%', marginBottom: 6, background: activeConversationKey === conversation.key ? '#e5e7eb' : '#fff' }}
                onClick={() => {
                  setActiveConversationKey(conversation.key);
                  setReplyTo(null);
                }}
              >
                <div style={{ textAlign: 'left', fontWeight: 600, fontSize: '0.8rem' }}>
                  {conversation.topic || 'Untitled thread'}
                </div>
                <div style={{ textAlign: 'left', fontSize: '0.72rem', color: '#6b7280' }}>
                  {conversation.messages.length} messages
                </div>
              </button>
            ))}
          </div>

          <div
            style={{ padding: '0.5rem', maxHeight: 460, overflow: 'auto' }}
            onDrop={onDropTransaction}
            onDragOver={(event) => event.preventDefault()}
          >
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.4rem' }}>
              Company: {companyId || '-'} • User: {selfEmpId || '-'} • Online: {onlineUsers.length}
            </div>
            <div style={{ position: 'sticky', top: 0, background: '#f9fafb', padding: '0.35rem 0.45rem', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: '0.4rem', fontWeight: 600 }}>
              Topic: {displayedTopic || 'Set topic for this thread'}
            </div>
            {activeConversationKey === 'new' && (
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Set topic"
                style={{ width: '100%', marginBottom: 6 }}
              />
            )}
            {replyTo && (
              <div style={{ fontSize: '0.75rem' }}>
                Replying to #{replyTo} <button onClick={() => setReplyTo(null)}>cancel</button>
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Write message"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
              {mentionSuggestions.map((entry) => (
                <button key={entry.empid} style={{ fontSize: '0.72rem' }} onClick={() => insertMention(entry.empid)}>
                  @{entry.empid}
                </button>
              ))}
            </div>
            <input
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="plan id (optional)"
              style={{ width: '100%', marginTop: 4 }}
            />
            {transactionDraft && (
              <button
                style={{ marginTop: 6, display: 'block', fontSize: '0.75rem' }}
                onClick={() => {
                  if (transactionDraft?.id) {
                    window.dispatchEvent(
                      new CustomEvent('table:open-transaction', {
                        detail: transactionDraft,
                      }),
                    );
                  }
                }}
              >
                📎 {transactionDraft.label || `Transaction ${transactionDraft.id}`}
              </button>
            )}
            <button onClick={send} style={{ marginTop: 8 }}>
              Send
            </button>
            <div style={{ marginTop: '0.75rem' }}>
              {activeMessages.map((msg) => (
                <MessageNode
                  key={msg.id}
                  msg={msg}
                  onReply={setReplyTo}
                  highlightedParentId={highlightedParentId}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
