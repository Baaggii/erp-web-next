import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

function sortByTimeAsc(list) {
  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function buildThread(messages, rootId) {
  const scoped = sortByTimeAsc(messages.filter((m) => Number(m.id) === Number(rootId) || Number(m.parent_message_id) === Number(rootId)));
  const byId = new Map(scoped.map((m) => [m.id, { ...m, replies: [] }]));
  const roots = [];
  byId.forEach((node) => {
    if (node.parent_message_id && byId.has(node.parent_message_id)) {
      byId.get(node.parent_message_id).replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function MessageNode({ msg, onReply, highlightedIds, onOpenTransaction }) {
  const isHighlighted = highlightedIds.has(msg.id);
  return (
    <div style={{ borderLeft: '2px solid #e5e7eb', marginLeft: '0.35rem', paddingLeft: '0.5rem', marginBottom: '0.5rem', background: isHighlighted ? '#fef3c7' : 'transparent', transition: 'background 0.4s ease' }}>
      <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
        {msg.author_empid} • {new Date(msg.created_at).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.74rem', color: '#4b5563' }}>
        {msg.transaction_id && (
          <button onClick={() => onOpenTransaction(msg)} style={{ fontSize: '0.72rem' }}>
            🔗 txn:{msg.transaction_id}
          </button>
        )}
        {msg.plan_id && <span>plan: {msg.plan_id}</span>}
        {msg.topic && <span>topic: {msg.topic}</span>}
      </div>
      <button style={{ fontSize: '0.75rem' }} onClick={() => onReply(msg.id)}>Reply</button>
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
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      const nextTopics = Array.isArray(data.topics) ? data.topics : [];
      setTopics(nextTopics);
      if (!selectedTopicRootId && nextTopics.length) {
        setSelectedTopicRootId(nextTopics[0].rootMessageId);
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
      if (next?.topic) {
        setTopics((prev) => {
          const exists = prev.some((t) => Number(t.rootMessageId) === Number(next.id));
          if (!next.parent_message_id && !exists) {
            return [{ rootMessageId: next.id, topic: next.topic, lastMessageAt: next.created_at, participants: [next.author_empid, ...(next.recipients || [])] }, ...prev];
          }
          return prev;
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
    setReplyTo(null);
    setBody('');
    setTopic('');
    setPlanId('');
    setTransaction(null);
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
    if (!selectedTopicRootId) {
      setShowComposer(false);
    }
    await reloadAll();
  }

  function onOpenTransaction(msg) {
    const detail = {
      id: msg.transaction_id,
      table: msg.transaction_table,
      rowId: msg.transaction_row_id,
      label: msg.transaction_label,
    };
    const event = new CustomEvent('messaging:open-transaction', { detail });
    window.dispatchEvent(event);
    if (msg.transaction_table && msg.transaction_row_id) {
      window.location.hash = `#/forms/${String(msg.transaction_table).replace(/_/g, '-')}`;
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
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

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: open ? 460 : 260, zIndex: 1200, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', background: '#1f2937', color: '#fff', border: 0, borderRadius: '8px 8px 0 0', padding: '0.5rem', textAlign: 'left' }}>
        💬 Messages {open ? '▾' : '▸'}
      </button>

      {!open && (
        <div style={{ padding: '0.45rem', maxHeight: 170, overflow: 'auto' }}>
          {(topics || []).slice(0, 6).map((item) => (
            <div key={item.rootMessageId} style={{ fontSize: '0.78rem', padding: '0.15rem 0' }}>
              • {item.topic}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.5rem', padding: '0.5rem', maxHeight: 600 }}>
          <div style={{ borderRight: '1px solid #e5e7eb', paddingRight: '0.5rem', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.82rem' }}>Topics</strong>
              <button style={{ fontSize: '0.72rem' }} onClick={openNewMessageBox}>+ New</button>
            </div>
            {(topics || []).map((item) => (
              <button key={item.rootMessageId} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4, background: Number(selectedTopicRootId) === Number(item.rootMessageId) ? '#eef2ff' : 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.3rem' }} onClick={() => { setSelectedTopicRootId(item.rootMessageId); setTopic(item.topic || ''); setSelectedRecipients(item.participants?.filter((id) => id !== user?.empid) || []); }}>
                <div style={{ fontSize: '0.78rem' }}>{item.topic}</div>
                <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{new Date(item.lastMessageAt || item.createdAt).toLocaleString()}</div>
              </button>
            ))}

            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: '0.82rem' }}>Employees</strong>
              <div style={{ maxHeight: 170, overflow: 'auto', marginTop: 4 }}>
                {employees.map((emp) => {
                  const online = onlineSet.has(String(emp.empid));
                  const selected = selectedRecipients.includes(String(emp.empid));
                  return (
                    <label key={emp.empid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: online ? '#16a34a' : '#6b7280' }}>
                      <input type="checkbox" checked={selected} onChange={() => setSelectedRecipients((prev) => toggleEmpid(prev, String(emp.empid)))} />
                      <span>●</span>
                      <span>{emp.name || emp.empid}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ position: 'sticky', top: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.35rem', marginBottom: 6 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Topic (permanent header)</div>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic" style={{ width: '100%' }} />
            </div>

            {(showComposer || selectedTopic) && (
              <>
                <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} style={{ border: '1px dashed #9ca3af', borderRadius: 6, padding: '0.3rem', fontSize: '0.72rem', color: '#374151', marginBottom: 6 }}>
                  Drag and drop transaction here
                  {transaction?.id && <div>Attached: {transaction.label || transaction.id}</div>}
                </div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {(selectedRecipients || []).map((empid) => (
                    <button key={empid} onClick={() => applyMention(empid)} style={{ fontSize: '0.68rem' }}>@{empid}</button>
                  ))}
                </div>

                {replyTo && <div style={{ fontSize: '0.75rem' }}>Replying to #{replyTo} <button onClick={() => setReplyTo(null)}>cancel</button></div>}
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write message" style={{ width: '100%' }} />
                <input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="plan id (optional)" style={{ width: '100%', marginTop: 4 }} />
                <button onClick={send} style={{ marginTop: 6, alignSelf: 'flex-start' }}>Send</button>
              </>
            )}

            <div style={{ marginTop: 8, overflow: 'auto', maxHeight: 320, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
              {currentThread.map((msg) => (
                <MessageNode
                  key={msg.id}
                  msg={msg}
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
