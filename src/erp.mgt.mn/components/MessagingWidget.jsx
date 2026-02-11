import React, { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';
import { connectSocket, disconnectSocket } from '../utils/socket.js';
import {
  PRESENCE,
  buildSessionStorageKey,
  createInitialWidgetState,
  getCompanyCacheKey,
  messagingWidgetReducer,
  normalizeId,
  safePreviewableFile,
  sanitizeMessageText,
} from './messagingWidgetModel.js';

function countNestedReplies(message) {
  const replies = Array.isArray(message?.replies) ? message.replies : [];
  return replies.reduce((sum, child) => sum + 1 + countNestedReplies(child), 0);
}

function buildNestedThreads(messages) {
  const map = new Map(messages.map((msg) => [msg.id, { ...msg, replies: [] }]));
  const roots = [];
  map.forEach((msg) => {
    const parent = msg.parent_message_id ? map.get(msg.parent_message_id) : null;
    if (parent) parent.replies.push(msg);
    else roots.push(msg);
  });
  const sortTree = (nodes) => {
    nodes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    nodes.forEach((node) => sortTree(node.replies));
  };
  sortTree(roots);
  return roots;
}

function groupConversations(messages) {
  const map = new Map();
  messages.forEach((msg) => {
    const key = String(msg.conversation_id || msg.topic || 'general');
    if (!map.has(key)) map.set(key, { id: key, title: msg.topic || 'General', messages: [] });
    map.get(key).messages.push(msg);
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.messages.at(-1)?.created_at || 0).getTime();
    const bTime = new Date(b.messages.at(-1)?.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function resolvePresence(record) {
  const status = String(record?.presence || record?.status || '').toLowerCase();
  if (status === PRESENCE.ONLINE || status === PRESENCE.AWAY || status === PRESENCE.OFFLINE) {
    return status;
  }
  return record?.last_seen_at ? PRESENCE.AWAY : PRESENCE.OFFLINE;
}

function canOpenContextLink(permissions, chipType) {
  const allow = permissions?.messaging?.linkedContext?.[chipType];
  if (typeof allow === 'boolean') return allow;
  return permissions?.isAdmin === true;
}

function MessageNode({ message, onReply, onJumpToParent, parentMap, permissions }) {
  const replyCount = countNestedReplies(message);
  const safeBody = sanitizeMessageText(message.body);
  return (
    <article aria-label={`Message ${message.id}`} style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: 8, marginBottom: 8 }}>
      <header style={{ fontSize: 12, color: '#334155' }}>
        {message.author_empid} · {new Date(message.created_at).toLocaleString()}
      </header>
      <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{safeBody || 'Empty message'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {message.transaction_id && (
          <button
            type="button"
            disabled={!canOpenContextLink(permissions, 'transaction')}
            aria-label={`Open transaction ${message.transaction_id}`}
            onClick={() => window.dispatchEvent(new CustomEvent('messaging:open-transaction', { detail: { id: message.transaction_id } }))}
          >
            txn:{message.transaction_id}
          </button>
        )}
        {message.plan_id && <span>plan:{message.plan_id}</span>}
        {message.topic && <span>topic:{message.topic}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={() => onReply(message.id)} aria-label={`Reply to message ${message.id}`}>Reply</button>
        {message.parent_message_id && parentMap.has(message.parent_message_id) && (
          <button type="button" onClick={() => onJumpToParent(message.parent_message_id)} aria-label="Jump to parent message">
            Jump to parent
          </button>
        )}
        {replyCount > 0 && <span aria-label="Nested reply count">{replyCount} replies</span>}
      </div>
      {message.replies.map((child) => (
        <MessageNode
          key={child.id}
          message={child}
          onReply={onReply}
          onJumpToParent={onJumpToParent}
          parentMap={parentMap}
          permissions={permissions}
        />
      ))}
    </article>
  );
}

export default function MessagingWidget() {
  const { session, user, permissions, company } = useContext(AuthContext);
  const sessionId = session?.id || user?.id || user?.empid;
  const companyId = normalizeId(company || session?.company_id || session?.companyId);
  const selfEmpid = normalizeId(user?.empid);

  const sessionOpenKey = buildSessionStorageKey(sessionId, 'open');
  const sessionConversationKey = buildSessionStorageKey(sessionId, 'conversation');
  const sessionCompanyKey = buildSessionStorageKey(sessionId, 'company');

  const bootState = createInitialWidgetState({
    isOpen: globalThis.sessionStorage?.getItem(sessionOpenKey) === '1',
    activeConversationId: globalThis.sessionStorage?.getItem(sessionConversationKey),
    companyId: globalThis.sessionStorage?.getItem(sessionCompanyKey) || companyId,
  });

  const [state, dispatch] = useReducer(messagingWidgetReducer, bootState);
  const [messagesByCompany, setMessagesByCompany] = useState({});
  const [presence, setPresence] = useState([]);
  const [networkState, setNetworkState] = useState('loading');
  const [error, setError] = useState('');
  const [composerAnnouncement, setComposerAnnouncement] = useState('');
  const composerRef = useRef(null);

  const cacheKey = getCompanyCacheKey(state.activeCompanyId || companyId);
  const messages = messagesByCompany[cacheKey] || [];

  useEffect(() => {
    globalThis.sessionStorage?.setItem(sessionOpenKey, state.isOpen ? '1' : '0');
  }, [state.isOpen, sessionOpenKey]);

  useEffect(() => {
    if (state.activeConversationId) {
      globalThis.sessionStorage?.setItem(sessionConversationKey, String(state.activeConversationId));
    }
  }, [state.activeConversationId, sessionConversationKey]);

  useEffect(() => {
    const nextCompany = companyId || state.activeCompanyId;
    if (!nextCompany) return;
    globalThis.sessionStorage?.setItem(sessionCompanyKey, String(nextCompany));
  }, [companyId, state.activeCompanyId, sessionCompanyKey]);

  useEffect(() => {
    if (!companyId || state.activeCompanyId === companyId) return;
    dispatch({ type: 'company/switch', payload: companyId });
    setPresence([]);
    setError('');
    setNetworkState('loading');
  }, [companyId, state.activeCompanyId]);

  useEffect(() => {
    const activeCompany = state.activeCompanyId || companyId;
    if (!activeCompany) return;
    let disposed = false;
    const load = async () => {
      try {
        setNetworkState('loading');
        const params = new URLSearchParams({ companyId: activeCompany, limit: '100' });
        const res = await fetch(`${API_BASE}/messaging?${params.toString()}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        const data = await res.json();
        if (disposed) return;
        setMessagesByCompany((prev) => ({ ...prev, [getCompanyCacheKey(activeCompany)]: Array.isArray(data.messages) ? data.messages : [] }));
        setPresence(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
        setNetworkState('ready');
      } catch (err) {
        if (disposed) return;
        setNetworkState('error');
        setError(err.message || 'Messaging unavailable');
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, [companyId, state.activeCompanyId]);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (payload) => {
      if (normalizeId(payload?.company_id || payload?.companyId) !== (state.activeCompanyId || companyId)) return;
      setMessagesByCompany((prev) => {
        const key = getCompanyCacheKey(state.activeCompanyId || companyId);
        return { ...prev, [key]: [...(prev[key] || []), payload] };
      });
    };
    const onPresence = (payload) => {
      setPresence(Array.isArray(payload?.onlineUsers) ? payload.onlineUsers : []);
    };
    socket.on('messages:new', onNew);
    socket.on('messages:presence', onPresence);
    return () => {
      socket.off('messages:new', onNew);
      socket.off('messages:presence', onPresence);
      disconnectSocket();
    };
  }, [state.activeCompanyId, companyId]);

  const conversations = useMemo(() => groupConversations(messages), [messages]);
  const activeConversationId = state.activeConversationId || conversations[0]?.id || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const threadMessages = useMemo(() => buildNestedThreads(activeConversation?.messages || []), [activeConversation]);
  const messageMap = useMemo(() => new Map(messages.map((msg) => [msg.id, msg])), [messages]);

  const unreadCount = messages.filter((msg) => !msg.read_by?.includes?.(selfEmpid)).length;
  const participants = presence.map((entry) => ({ id: normalizeId(entry.empid || entry.id), status: resolvePresence(entry) }));

  const sendMessage = async () => {
    const safeBody = sanitizeMessageText(state.composer.body);
    if (!safeBody) {
      setComposerAnnouncement('Cannot send an empty message.');
      return;
    }
    const activeCompany = state.activeCompanyId || companyId;
    const payload = {
      body: safeBody,
      companyId: activeCompany,
      parentMessageId: state.composer.replyToId,
      conversationId: activeConversationId,
      attachments: state.composer.attachments.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    };
    const res = await fetch(`${API_BASE}/messaging`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      dispatch({ type: 'composer/reset' });
      setComposerAnnouncement('Message sent.');
      composerRef.current?.focus();
    }
  };

  const onAttach = (event) => {
    const files = Array.from(event.target.files || []).filter(safePreviewableFile);
    dispatch({ type: 'composer/setAttachments', payload: files });
    setComposerAnnouncement(files.length ? `${files.length} file(s) attached.` : 'No safe files selected.');
  };

  const onSwitchCompany = (event) => {
    const nextCompany = normalizeId(event.target.value);
    if (!nextCompany || nextCompany === state.activeCompanyId) return;
    dispatch({ type: 'company/switch', payload: nextCompany });
    setMessagesByCompany((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key !== getCompanyCacheKey(nextCompany)) delete next[key];
      });
      return next;
    });
  };

  if (!state.isOpen) {
    return (
      <section style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200 }}>
        <button type="button" aria-label="Open messaging widget" onClick={() => dispatch({ type: 'widget/open' })}>
          💬 Messages {unreadCount > 0 ? `(${unreadCount})` : ''}
        </button>
        <div aria-label="Collaborator presence summary" style={{ marginTop: 4, fontSize: 12 }}>
          {participants.slice(0, 3).map((entry) => (
            <span key={entry.id} style={{ marginRight: 6 }}>{entry.id}:{entry.status}</span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      style={{ position: 'fixed', right: 16, bottom: 16, width: 760, maxWidth: '95vw', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, zIndex: 1200 }}
      aria-label="Messaging widget"
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#0f172a', color: '#fff' }}>
        <strong>Messaging</strong>
        <button type="button" onClick={() => dispatch({ type: 'widget/close' })} aria-label="Collapse messaging widget">Collapse</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1.2fr', minHeight: 420 }}>
        <aside style={{ borderRight: '1px solid #e2e8f0', padding: 8 }}>
          <label htmlFor="messaging-company-switch">Company</label>
          <input id="messaging-company-switch" value={state.activeCompanyId || ''} onChange={onSwitchCompany} aria-label="Switch company context" />
          <h4>Conversations</h4>
          {conversations.length === 0 && <p>No conversations yet.</p>}
          {conversations.map((conversation) => (
            <button key={conversation.id} type="button" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => dispatch({ type: 'widget/setConversation', payload: conversation.id })}>
              {conversation.title} ({conversation.messages.length})
            </button>
          ))}
        </aside>

        <main style={{ borderRight: '1px solid #e2e8f0', padding: 8, overflowY: 'auto' }} aria-live="polite">
          {networkState === 'loading' && <p>Loading messages…</p>}
          {networkState === 'error' && <p role="alert">{error}</p>}
          {networkState === 'ready' && threadMessages.length === 0 && <p>No messages in this thread.</p>}
          {threadMessages.map((message) => (
            <MessageNode
              key={message.id}
              message={message}
              parentMap={messageMap}
              permissions={permissions || {}}
              onReply={(id) => dispatch({ type: 'composer/setReplyTo', payload: id })}
              onJumpToParent={(parentId) => document.querySelector(`[aria-label='Message ${parentId}']`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />
          ))}
        </main>

        <form style={{ padding: 8 }} onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <label htmlFor="messaging-composer">Message</label>
          <textarea
            id="messaging-composer"
            ref={composerRef}
            value={state.composer.body}
            onChange={(event) => dispatch({ type: 'composer/setBody', payload: event.target.value })}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
              }
            }}
            rows={5}
            aria-label="Message composer"
          />
          <div>{state.composer.replyToId ? `Replying to #${state.composer.replyToId}` : 'New message'}</div>
          <label htmlFor="messaging-attachments">Attachments</label>
          <input id="messaging-attachments" type="file" multiple onChange={onAttach} aria-label="Attachment picker" />
          <ul>
            {state.composer.attachments.map((file) => (
              <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
            ))}
          </ul>
          <button type="submit">Send</button>
          <p aria-live="assertive" style={{ fontSize: 12 }}>{composerAnnouncement}</p>
        </form>
      </div>
    </section>
  );
}
