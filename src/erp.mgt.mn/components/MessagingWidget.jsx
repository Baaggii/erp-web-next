import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

function byTimeAsc(list) {
  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function findRootId(messageId, byId) {
  let current = byId.get(Number(messageId));
  let guard = 0;
  while (current && current.parent_message_id && guard < 2000) {
    const parentId = Number(current.parent_message_id);
    if (!byId.has(parentId)) break;
    current = byId.get(parentId);
    guard += 1;
  }
  return Number(current?.id || messageId);
}

function buildThread(messages, rootId) {
  const byId = new Map(messages.map((m) => [Number(m.id), { ...m, replies: [] }]));
  byId.forEach((node) => {
    if (node.parent_message_id && byId.has(Number(node.parent_message_id))) {
      byId.get(Number(node.parent_message_id)).replies.push(node);
    }
  });

  const threadIds = new Set();
  byId.forEach((_, messageId) => {
    if (findRootId(messageId, byId) === Number(rootId)) {
      threadIds.add(Number(messageId));
    }
  });

  if (!threadIds.size) return [];
  threadIds.forEach((id) => {
    const node = byId.get(id);
    node.replies = node.replies
      .filter((reply) => threadIds.has(Number(reply.id)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  const rootNode = byId.get(Number(rootId));
  return rootNode ? [rootNode] : [];
}

function toggleEmpid(list, empid) {
  if (list.includes(empid)) return list.filter((id) => id !== empid);
  return [...list, empid];
}

function MessageNode({ msg, onReply, highlightedIds, onOpenTransaction }) {
  const highlighted = highlightedIds.has(msg.id);
  return (
    <div
      style={{
        borderLeft: '2px solid #e5e7eb',
        marginLeft: '0.45rem',
        paddingLeft: '0.65rem',
        marginBottom: '0.6rem',
        borderRadius: 4,
        background: highlighted ? '#fef3c7' : 'transparent',
        transition: 'background 0.35s ease',
      }}
    >
      <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>
        {msg.author_empid} • {new Date(msg.created_at).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{msg.body}</div>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: 2 }}>
        {msg.transaction_id && (
          <button style={{ fontSize: '0.7rem' }} onClick={() => onOpenTransaction(msg)}>
            🔗 {msg.transaction_label || `txn:${msg.transaction_id}`}
          </button>
        )}
        {msg.plan_id && <span style={{ fontSize: '0.7rem' }}>plan: {msg.plan_id}</span>}
      </div>
      <button style={{ fontSize: '0.72rem', marginTop: 2 }} onClick={() => onReply(msg.id)}>
        ↩ Reply
      </button>
      {(msg.replies || []).map((reply) => (
        <MessageNode
          key={reply.id}
          msg={reply}
          onReply={onReply}
          highlightedIds={highlightedIds}
          onOpenTransaction={onOpenTransaction}
        />
      ))}
    </div>
  );
}

export default function MessagingWidget() {
  const { session, company, user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [topics, setTopics] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [selectedTopicRootId, setSelectedTopicRootId] = useState(null);

  // main-window user selection
  const [selectedRecipients, setSelectedRecipients] = useState([]);

  // new message dialog
  const [composerOpen, setComposerOpen] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [planIdInput, setPlanIdInput] = useState('');
  const [transaction, setTransaction] = useState(null);

  const companyId = company ?? session?.company_id ?? session?.companyId;
  const onlineSet = useMemo(() => new Set((onlineUsers || []).map((value) => String(value))), [onlineUsers]);

  const selectedTopic = useMemo(
    () => topics.find((item) => Number(item.rootMessageId) === Number(selectedTopicRootId)) || null,
    [topics, selectedTopicRootId],
  );

  const employeesById = useMemo(() => {
    const map = new Map();
    employees.forEach((row) => map.set(String(row.empid), row));
    return map;
  }, [employees]);

  const selectedRecipientRows = useMemo(
    () => selectedRecipients.map((empid) => ({ empid, row: employeesById.get(String(empid)) })),
    [selectedRecipients, employeesById],
  );

  const currentThread = useMemo(() => {
    if (!selectedTopic) return [];
    return buildThread(messages, selectedTopic.rootMessageId);
  }, [messages, selectedTopic]);

  async function reloadAll() {
    if (!companyId) return;
    const params = new URLSearchParams({ companyId: String(companyId), limit: '400' });
    const [messagesRes, peopleRes] = await Promise.all([
      fetch(`${API_BASE}/messaging?${params.toString()}`, { credentials: 'include' }),
      fetch(`${API_BASE}/messaging/people?companyId=${encodeURIComponent(companyId)}`, { credentials: 'include' }),
    ]);

    if (messagesRes.ok) {
      const data = await messagesRes.json();
      const nextTopics = Array.isArray(data.topics) ? data.topics : [];
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setTopics(nextTopics);
      setOnlineUsers(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
      if (!selectedTopicRootId && nextTopics.length) {
        setSelectedTopicRootId(nextTopics[0].rootMessageId);
      }
    }

    if (peopleRes.ok) {
      const data = await peopleRes.json();
      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      setOnlineUsers(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
    }
  }

  useEffect(() => {
    reloadAll();
  }, [companyId]);

  useEffect(() => {
    const onStart = (event) => {
      const detail = event?.detail || {};
      setOpen(true);
      const recipients = Array.isArray(detail.recipientEmpids) ? detail.recipientEmpids.map(String) : [];
      setSelectedRecipients(recipients);
      setTopicInput(String(detail.topic || detail.transaction?.label || 'Transaction discussion'));
      setTransaction(detail.transaction || null);
      setComposerOpen(true);
      setReplyTo(null);
    };

    window.addEventListener('messaging:start', onStart);
    return () => window.removeEventListener('messaging:start', onStart);
  }, []);

  useEffect(() => {
    const socket = connectSocket();

    const onNew = (next) => {
      setMessages((prev) => {
        if (prev.some((entry) => Number(entry.id) === Number(next?.id))) return prev;
        return [...prev, next];
      });

      if (next?.topic || next?.parent_message_id) {
        setTopics((prev) => {
          if (!next.parent_message_id) {
            const exists = prev.some((topicRow) => Number(topicRow.rootMessageId) === Number(next.id));
            if (!exists) {
              return [{
                rootMessageId: next.id,
                topic: next.topic || 'Untitled topic',
                lastMessageAt: next.created_at,
                participants: [next.author_empid, ...(next.recipients || [])],
              }, ...prev];
            }
            return prev;
          }

          const updated = prev.map((topicRow) => {
            if (
              Number(topicRow.rootMessageId) !== Number(next.parent_message_id)
              && Number(topicRow.rootMessageId) !== Number(next.root_id)
            ) {
              return topicRow;
            }
            return {
              ...topicRow,
              lastMessageAt: next.created_at,
              participants: Array.from(new Set([...(topicRow.participants || []), next.author_empid])),
            };
          });
          return updated.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        });
      }

      if (replyTo && Number(next?.parent_message_id) === Number(replyTo)) {
        setHighlightedIds((prev) => new Set(prev).add(next.id));
        setTimeout(() => {
          setHighlightedIds((prev) => {
            const cloned = new Set(prev);
            cloned.delete(next.id);
            return cloned;
          });
        }, 3200);
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

  function openNewMessageFromSelection() {
    if (!selectedRecipients.length) return;
    setComposerOpen(true);
    setReplyTo(null);
    setBodyInput('');
    setPlanIdInput('');
    setTransaction(null);
    if (!topicInput) setTopicInput('New Topic');
  }

  function applyMention(empid) {
    setBodyInput((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${empid} `);
  }

  function onOpenTransaction(msg) {
    const detail = {
      id: msg.transaction_id,
      table: msg.transaction_table,
      rowId: msg.transaction_row_id,
      label: msg.transaction_label,
    };
    window.dispatchEvent(new CustomEvent('messaging:open-transaction', { detail }));
    if (msg.transaction_table && msg.transaction_row_id) {
      window.location.hash = `#/forms/${String(msg.transaction_table).replace(/_/g, '-')}`;
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const dropped = {
        id: parsed.transactionId || parsed.id || parsed.rowId || '',
        table: parsed.table || parsed.transactionTable || null,
        rowId: parsed.rowId || parsed.id || null,
        label: parsed.label || parsed.name || parsed.transactionName || null,
      };
      if (dropped.id) setTransaction(dropped);
    } catch {
      const text = String(raw).trim();
      if (text) setTransaction({ id: text, label: text });
    }
  }

  async function sendMessage() {
    const payload = {
      companyId,
      body: bodyInput,
      topic: topicInput || selectedTopic?.topic || null,
      planId: planIdInput || null,
      recipientEmpids: selectedRecipients,
      parentMessageId: replyTo || null,
      transactionId: transaction?.id || null,
      transaction: transaction || null,
    };

    const response = await fetch(`${API_BASE}/messaging`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return;

    setBodyInput('');
    setReplyTo(null);
    await reloadAll();
    setComposerOpen(false);
  }

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: open ? 860 : 300, zIndex: 1200, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{ width: '100%', background: '#1f2937', color: '#fff', border: 0, borderRadius: '8px 8px 0 0', padding: '0.5rem', textAlign: 'left' }}
      >
        💬 Messages {open ? '▾' : '▸'}
      </button>

      {!open && (
        <div style={{ padding: '0.45rem', maxHeight: 220, overflow: 'auto' }}>
          {(topics || []).slice(0, 8).map((topicRow) => (
            <button
              key={topicRow.rootMessageId}
              onClick={() => {
                setOpen(true);
                setSelectedTopicRootId(topicRow.rootMessageId);
              }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 4, padding: '0.3rem', background: 'transparent' }}
            >
              <div style={{ fontSize: '0.78rem' }}>• {topicRow.topic}</div>
              <div style={{ fontSize: '0.66rem', color: '#6b7280' }}>{new Date(topicRow.lastMessageAt || topicRow.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 2fr', gap: '0.5rem', padding: '0.5rem', maxHeight: 660 }}>
          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: '0.5rem', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.85rem' }}>Users</strong>
              <button style={{ fontSize: '0.72rem' }} disabled={!selectedRecipients.length} onClick={openNewMessageFromSelection}>+ New Message</button>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>Select online/offline users</div>

            <div style={{ marginTop: 6 }}>
              {employees.map((employee) => {
                const empid = String(employee.empid);
                const online = onlineSet.has(empid);
                const selected = selectedRecipients.includes(empid);
                return (
                  <label key={empid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: online ? '#16a34a' : '#6b7280' }}>
                    <input type="checkbox" checked={selected} onChange={() => setSelectedRecipients((prev) => toggleEmpid(prev, empid))} />
                    <span>●</span>
                    <span>{employee.name || empid}</span>
                    <span style={{ fontSize: '0.66rem' }}>({online ? 'online' : 'offline'})</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: '0.5rem', overflow: 'auto' }}>
            <strong style={{ fontSize: '0.85rem' }}>Topics</strong>
            {(topics || []).map((topicRow) => (
              <button
                key={topicRow.rootMessageId}
                onClick={() => {
                  setSelectedTopicRootId(topicRow.rootMessageId);
                  setTopicInput(topicRow.topic || '');
                  setSelectedRecipients(topicRow.participants?.filter((id) => id !== user?.empid) || []);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, padding: '0.3rem', background: Number(selectedTopicRootId) === Number(topicRow.rootMessageId) ? '#eef2ff' : 'transparent' }}
              >
                <div style={{ fontSize: '0.78rem' }}>{topicRow.topic}</div>
                <div style={{ fontSize: '0.66rem', color: '#6b7280' }}>{new Date(topicRow.lastMessageAt || topicRow.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>

          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'sticky', top: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.35rem', marginBottom: 6 }}>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Topic header (always visible)</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{topicInput || selectedTopic?.topic || 'No topic selected'}</div>
            </div>

            <div style={{ marginTop: 4, overflow: 'auto', maxHeight: 510, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
              {currentThread.length === 0 && <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Select a topic or start a new message from selected users.</div>}
              {currentThread.map((message) => (
                <MessageNode
                  key={message.id}
                  msg={message}
                  onReply={(id) => {
                    setReplyTo(id);
                    setComposerOpen(true);
                  }}
                  highlightedIds={highlightedIds}
                  onOpenTransaction={onOpenTransaction}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {composerOpen && open && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.24)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div style={{ width: 'min(660px, 95%)', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: 10, maxHeight: '88%', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>New Message</strong>
              <button onClick={() => setComposerOpen(false)}>✕</button>
            </div>

            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Topic</div>
              <input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} placeholder="Set topic" style={{ width: '100%' }} />
            </div>

            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {selectedRecipientRows.map(({ empid, row }) => (
                <span key={empid} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #d1d5db', borderRadius: 9999, padding: '2px 8px', fontSize: '0.69rem' }}>
                  {row?.name || empid}
                  <button style={{ fontSize: '0.65rem' }} onClick={() => applyMention(empid)}>@</button>
                </span>
              ))}
            </div>

            <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} style={{ marginTop: 8, border: '1px dashed #9ca3af', borderRadius: 6, padding: '0.35rem', fontSize: '0.72rem' }}>
              Drag and drop transaction here
              {transaction?.id && (
                <div>
                  Attached:{' '}
                  <button
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => onOpenTransaction({
                      transaction_id: transaction.id,
                      transaction_table: transaction.table,
                      transaction_row_id: transaction.rowId,
                      transaction_label: transaction.label,
                    })}
                  >
                    {transaction.label || transaction.id}
                  </button>
                </div>
              )}
            </div>

            {replyTo && <div style={{ fontSize: '0.74rem', marginTop: 6 }}>Replying to #{replyTo} <button onClick={() => setReplyTo(null)}>cancel</button></div>}
            <textarea value={bodyInput} onChange={(event) => setBodyInput(event.target.value)} rows={4} placeholder="Write message after setting topic" style={{ width: '100%', marginTop: 6 }} />
            <input value={planIdInput} onChange={(event) => setPlanIdInput(event.target.value)} placeholder="plan id (optional)" style={{ width: '100%', marginTop: 6 }} />
            <button onClick={sendMessage} style={{ marginTop: 8 }}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
