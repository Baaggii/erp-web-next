import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';

function threadMessages(messages) {
  const byId = new Map(messages.map((msg) => [msg.id, { ...msg, replies: [] }]));
  const roots = [];
  byId.forEach((msg) => {
    if (msg.parent_message_id && byId.has(msg.parent_message_id)) {
      byId.get(msg.parent_message_id).replies.push(msg);
    } else {
      roots.push(msg);
    }
  });
  return roots;
}

function MessageNode({ msg, onReply }) {
  return (
    <div style={{ borderLeft: '2px solid #e5e7eb', marginLeft: '0.5rem', paddingLeft: '0.5rem', marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
        {msg.author_empid} • {new Date(msg.created_at).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
      <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem', color: '#4b5563' }}>
        {msg.transaction_id && <span>txn: {msg.transaction_id}</span>}
        {msg.plan_id && <span>plan: {msg.plan_id}</span>}
        {msg.topic && <span>topic: {msg.topic}</span>}
      </div>
      <button style={{ fontSize: '0.75rem' }} onClick={() => onReply(msg.id)}>Reply</button>
      {msg.replies?.map((reply) => <MessageNode key={reply.id} msg={reply} onReply={onReply} />)}
    </div>
  );
}

export default function MessagingWidget() {
  const { session, company, user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [planId, setPlanId] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const companyId = company ?? session?.company_id ?? session?.companyId;

  const reload = async () => {
    if (!companyId) return;
    const params = new URLSearchParams({ companyId: String(companyId), limit: '100' });
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
    const socket = connectSocket();
    const onNew = (next) => {
      setMessages((prev) => [...prev, next]);
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
  }, [companyId]);

  const threaded = useMemo(() => threadMessages(messages), [messages]);

  const send = async () => {
    const payload = {
      companyId,
      body,
      topic: topic || null,
      transactionId: transactionId || null,
      planId: planId || null,
      parentMessageId: replyTo || null,
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
      setTopic('');
      setTransactionId('');
      setPlanId('');
      await reload();
    }
  };

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: open ? 360 : 180, zIndex: 1200, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', background: '#1f2937', color: '#fff', border: 0, borderRadius: '8px 8px 0 0', padding: '0.5rem', textAlign: 'left' }}>
        💬 Messages {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={{ padding: '0.5rem', maxHeight: 420, overflow: 'auto' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Company: {companyId || '-'} • User: {user?.empid || '-'} • Online: {onlineUsers.length}
          </div>
          {replyTo && <div style={{ fontSize: '0.75rem' }}>Replying to #{replyTo} <button onClick={() => setReplyTo(null)}>cancel</button></div>}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write message" style={{ width: '100%' }} />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic (optional)" style={{ width: '100%', marginTop: 4 }} />
          <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="transaction id (optional)" style={{ width: '100%', marginTop: 4 }} />
          <input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="plan id (optional)" style={{ width: '100%', marginTop: 4 }} />
          <button onClick={send} style={{ marginTop: 6 }}>Send</button>
          <div style={{ marginTop: '0.75rem' }}>
            {threaded.map((msg) => <MessageNode key={msg.id} msg={msg} onReply={setReplyTo} />)}
          </div>
        </div>
      )}
    </div>
  );
}
