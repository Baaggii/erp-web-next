import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

function sortByTimeAsc(list) {
  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function resolveThreadRootId(messageId, byId) {
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
    if (resolveThreadRootId(messageId, byId) === Number(rootId)) {
      threadIds.add(Number(messageId));
    }
  });

  if (!threadIds.size) return [];

  threadIds.forEach((messageId) => {
    const node = byId.get(messageId);
    node.replies = node.replies
      .filter((reply) => threadIds.has(Number(reply.id)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  });

  const rootNode = byId.get(Number(rootId));
  return rootNode ? [rootNode] : [];
}

function statusColor(isOnline) {
  return isOnline ? '#16a34a' : '#6b7280';
}

function MessageNode({ msg, onReply, highlightedIds, onOpenTransaction }) {
  const isHighlighted = highlightedIds.has(msg.id);
  return (
    <div
      style={{
        borderLeft: '2px solid #e5e7eb',
        marginLeft: '0.4rem',
        paddingLeft: '0.6rem',
        marginBottom: '0.55rem',
        background: isHighlighted ? '#fef3c7' : 'transparent',
        transition: 'background 0.4s ease',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
        {msg.author_empid} • {new Date(msg.created_at).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.74rem', color: '#4b5563' }}>
        {msg.transaction_id && (
          <button onClick={() => onOpenTransaction(msg)} style={{ fontSize: '0.72rem' }}>
            🔗 {msg.transaction_label || `txn:${msg.transaction_id}`}
          </button>
        )}
        {msg.plan_id && <span>plan: {msg.plan_id}</span>}
        {msg.topic && <span>topic: {msg.topic}</span>}
      </div>
      <button style={{ fontSize: '0.73rem' }} onClick={() => onReply(msg.id)}>↩ Reply</button>
      {msg.replies?.map((reply) => (
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

function toggleEmpid(list, empid) {
  if (list.includes(empid)) return list.filter((id) => id !== empid);
  return [...list, empid];
}

export default function MessagingWidget() {
  const { session, company, user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [topics, setTopics] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [planId, setPlanId] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [selectedTopicRootId, setSelectedTopicRootId] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState(new Set());

  const companyId = company ?? session?.company_id ?? session?.companyId;
  const onlineSet = useMemo(() => new Set((onlineUsers || []).map((v) => String(v))), [onlineUsers]);

  const employeesById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => map.set(String(employee.empid), employee));
    return map;
  }, [employees]);

  const selectedTopic = useMemo(
    () => topics.find((item) => Number(item.rootMessageId) === Number(selectedTopicRootId)) || null,
    [topics, selectedTopicRootId],
  );

  const currentThread = useMemo(() => {
    if (!selectedTopic) return [];
    return buildThread(messages, selectedTopic.rootMessageId);
  }, [messages, selectedTopic]);

  async function reloadAll() {
    if (!companyId) return;
    const params = new URLSearchParams({ companyId: String(companyId), limit: '400' });
    const [messageRes, peopleRes] = await Promise.all([
      fetch(`${API_BASE}/messaging?${params.toString()}`, { credentials: 'include' }),
      fetch(`${API_BASE}/messaging/people?companyId=${encodeURIComponent(companyId)}`, { credentials: 'include' }),
    ]);

    if (messageRes.ok) {
      const data = await messageRes.json();
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];
      const nextTopics = Array.isArray(data.topics) ? data.topics : [];
      setMessages(nextMessages);
      setTopics(nextTopics);
      if (!selectedTopicRootId && nextTopics.length) {
        setSelectedTopicRootId(nextTopics[0].rootMessageId);
        setTopic(nextTopics[0].topic || '');
      }
      setOnlineUsers(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
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
      setShowComposer(true);
      setTopic(String(detail.topic || detail.transaction?.label || 'Transaction discussion'));
      setSelectedRecipients(Array.isArray(detail.recipientEmpids) ? detail.recipientEmpids.map(String) : []);
      setTransaction(detail.transaction || null);
      setReplyTo(null);
    };
    window.addEventListener('messaging:start', onStart);
    return () => window.removeEventListener('messaging:start', onStart);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (next) => {
      setMessages((prev) => {
        if (prev.some((m) => Number(m.id) === Number(next?.id))) return prev;
        return [...prev, next];
      });

      if (next?.topic || next?.parent_message_id) {
        setTopics((prev) => {
          if (!next.parent_message_id) {
            const exists = prev.some((item) => Number(item.rootMessageId) === Number(next.id));
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

          const updated = prev.map((item) => {
            if (Number(item.rootMessageId) !== Number(next.parent_message_id) && Number(item.rootMessageId) !== Number(next.root_id)) {
              return item;
            }
            return {
              ...item,
              lastMessageAt: next.created_at,
              participants: Array.from(new Set([...(item.participants || []), next.author_empid])),
            };
          });

          return updated.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        });
      }

      if (replyTo && Number(next?.parent_message_id) === Number(replyTo)) {
        setHighlightedIds((prev) => new Set(prev).add(next.id));
        setTimeout(() => {
          setHighlightedIds((prev) => {
            const nextSet = new Set(prev);
            nextSet.delete(next.id);
            return nextSet;
          });
        }, 3500);
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

  function openNewMessageBox() {
    setShowComposer(true);
    setSelectedTopicRootId(null);
    setReplyTo(null);
    setBody('');
    setTopic('');
    setPlanId('');
    setTransaction(null);
    setSelectedRecipients([]);
  }

  function applyMention(empid) {
    const token = `@${empid} `;
    setBody((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
  }

  async function send() {
    const payload = {
      companyId,
      body,
      topic: topic || selectedTopic?.topic || null,
      planId: planId || null,
      recipientEmpids: selectedRecipients,
      parentMessageId: replyTo || null,
      transactionId: transaction?.id || null,
      transaction: transaction || null,
    };

    const res = await fetch(`${API_BASE}/messaging`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return;

    setBody('');
    setReplyTo(null);
    await reloadAll();
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
      const next = {
        id: parsed.transactionId || parsed.id || parsed.rowId || '',
        table: parsed.table || parsed.transactionTable || null,
        rowId: parsed.rowId || parsed.id || null,
        label: parsed.label || parsed.name || parsed.transactionName || null,
      };
      if (next.id) setTransaction(next);
    } catch {
      const text = String(raw).trim();
      if (text) setTransaction({ id: text, label: text });
    }
  }

  const selectedRecipientRows = selectedRecipients
    .map((empid) => ({ empid, row: employeesById.get(String(empid)) }))
    .filter((item) => item.empid);

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: open ? 520 : 280,
        zIndex: 1200,
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 8,
        boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
      }}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        style={{ width: '100%', background: '#1f2937', color: '#fff', border: 0, borderRadius: '8px 8px 0 0', padding: '0.5rem', textAlign: 'left' }}
      >
        💬 Messages {open ? '▾' : '▸'}
      </button>

      {!open && (
        <div style={{ padding: '0.45rem', maxHeight: 190, overflow: 'auto' }}>
          {(topics || []).slice(0, 8).map((item) => (
            <button
              key={item.rootMessageId}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                marginBottom: 4,
                padding: '0.3rem',
                background: 'transparent',
              }}
              onClick={() => {
                setOpen(true);
                setSelectedTopicRootId(item.rootMessageId);
                setTopic(item.topic || '');
                setShowComposer(true);
                setSelectedRecipients(item.participants?.filter((id) => id !== user?.empid) || []);
              }}
            >
              <div style={{ fontSize: '0.76rem' }}>• {item.topic}</div>
              <div style={{ fontSize: '0.66rem', color: '#6b7280' }}>{new Date(item.lastMessageAt || item.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr', gap: '0.5rem', padding: '0.5rem', maxHeight: 640 }}>
          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: '0.5rem', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.83rem' }}>Topics</strong>
              <button style={{ fontSize: '0.72rem' }} onClick={openNewMessageBox}>+ New Message</button>
            </div>

            {(topics || []).map((item) => (
              <button
                key={item.rootMessageId}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginTop: 4,
                  background: Number(selectedTopicRootId) === Number(item.rootMessageId) ? '#eef2ff' : 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: '0.3rem',
                }}
                onClick={() => {
                  setSelectedTopicRootId(item.rootMessageId);
                  setTopic(item.topic || '');
                  setSelectedRecipients(item.participants?.filter((id) => id !== user?.empid) || []);
                  setShowComposer(true);
                }}
              >
                <div style={{ fontSize: '0.78rem' }}>{item.topic}</div>
                <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{new Date(item.lastMessageAt || item.createdAt).toLocaleString()}</div>
              </button>
            ))}

            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: '0.82rem' }}>Employees</strong>
              <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>Green: online • Gray: offline</div>
              <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 4 }}>
                {employees.map((employee) => {
                  const online = onlineSet.has(String(employee.empid));
                  const selected = selectedRecipients.includes(String(employee.empid));
                  return (
                    <label
                      key={employee.empid}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: statusColor(online) }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedRecipients((prev) => toggleEmpid(prev, String(employee.empid)))}
                      />
                      <span>●</span>
                      <span>{employee.name || employee.empid}</span>
                      <span style={{ fontSize: '0.66rem', opacity: 0.8 }}>({online ? 'online' : 'offline'})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ position: 'sticky', top: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.35rem', marginBottom: 6 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Topic (always visible)</div>
              <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Topic" style={{ width: '100%' }} />
            </div>

            {showComposer && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                  {selectedRecipientRows.map(({ empid, row }) => (
                    <span
                      key={empid}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #d1d5db', borderRadius: 9999, padding: '2px 8px', fontSize: '0.68rem' }}
                    >
                      {row?.name || empid}
                      <button
                        style={{ fontSize: '0.65rem' }}
                        onClick={() => setSelectedRecipients((prev) => prev.filter((value) => String(value) !== String(empid)))}
                      >
                        ✕
                      </button>
                      <button style={{ fontSize: '0.65rem' }} onClick={() => applyMention(empid)}>@</button>
                    </span>
                  ))}
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={(event) => event.preventDefault()}
                  style={{ border: '1px dashed #9ca3af', borderRadius: 6, padding: '0.3rem', fontSize: '0.72rem', color: '#374151', marginBottom: 6 }}
                >
                  Drag and drop transaction here
                  {transaction?.id && (
                    <div>
                      Attached:{' '}
                      <button style={{ fontSize: '0.72rem' }} onClick={() => onOpenTransaction({
                        transaction_id: transaction.id,
                        transaction_table: transaction.table,
                        transaction_row_id: transaction.rowId,
                        transaction_label: transaction.label,
                      })}>
                        {transaction.label || transaction.id}
                      </button>
                    </div>
                  )}
                </div>

                {replyTo && (
                  <div style={{ fontSize: '0.75rem' }}>
                    Replying to #{replyTo}{' '}
                    <button onClick={() => setReplyTo(null)}>cancel</button>
                  </div>
                )}

                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={3}
                  placeholder="Write message"
                  style={{ width: '100%' }}
                />
                <input value={planId} onChange={(event) => setPlanId(event.target.value)} placeholder="plan id (optional)" style={{ width: '100%', marginTop: 4 }} />
                <button onClick={send} style={{ marginTop: 6, alignSelf: 'flex-start' }}>Send</button>
              </>
            )}

            <div style={{ marginTop: 8, overflow: 'auto', maxHeight: 330, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
              {currentThread.map((message) => (
                <MessageNode
                  key={message.id}
                  msg={message}
                  onReply={setReplyTo}
                  highlightedIds={highlightedIds}
                  onOpenTransaction={onOpenTransaction}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
