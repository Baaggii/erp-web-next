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

function extractMessageTopic(message) {
  return sanitizeMessageText(message?.topic || '').slice(0, 120);
}

function extractContextLink(message) {
  const linkedType = message?.linked_type || message?.linkedType || null;
  const linkedId = message?.linked_id || message?.linkedId || null;
  if (linkedType && linkedId) return { linkedType, linkedId };
  if (message?.transaction_id) return { linkedType: 'transaction', linkedId: String(message.transaction_id) };
  return { linkedType: null, linkedId: null };
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
    const topic = extractMessageTopic(msg);
    const link = extractContextLink(msg);
    const key = String(msg.conversation_id || msg.topic || `${link.linkedType || 'general'}:${link.linkedId || 'general'}`);
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title: topic || (link.linkedType === 'transaction' && link.linkedId ? `Transaction #${link.linkedId}` : 'General'),
        messages: [],
        linkedType: link.linkedType,
        linkedId: link.linkedId,
      });
    }
    const current = map.get(key);
    if (!current.title && topic) current.title = topic;
    current.messages.push(msg);
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

function presenceColor(status) {
  if (status === PRESENCE.ONLINE) return '#22c55e';
  if (status === PRESENCE.AWAY) return '#f59e0b';
  return '#94a3b8';
}

function canOpenContextLink(permissions, chipType) {
  const allow = permissions?.messaging?.linkedContext?.[chipType];
  if (typeof allow === 'boolean') return allow;
  return permissions?.isAdmin === true;
}

function MessageNode({ message, onReply, onJumpToParent, parentMap, permissions, activeReplyTarget }) {
  const replyCount = countNestedReplies(message);
  const safeBody = sanitizeMessageText(message.body);
  const linked = extractContextLink(message);
  const isReplyTarget = activeReplyTarget && Number(activeReplyTarget) === Number(message.id);
  return (
    <article
      aria-label={`Message ${message.id}`}
      style={{
        borderLeft: `2px solid ${isReplyTarget ? '#f97316' : '#e5e7eb'}`,
        background: isReplyTarget ? '#fff7ed' : 'transparent',
        paddingLeft: 8,
        marginBottom: 8,
      }}
    >
      <header style={{ fontSize: 12, color: '#334155' }}>
        {message.author_empid} · {new Date(message.created_at).toLocaleString()}
      </header>
      <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{safeBody || 'Empty message'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {linked.linkedType === 'transaction' && linked.linkedId && (
          <button
            type="button"
            disabled={!canOpenContextLink(permissions, 'transaction')}
            aria-label={`Open transaction ${linked.linkedId}`}
            onClick={() => window.dispatchEvent(new CustomEvent('messaging:open-transaction', { detail: { id: linked.linkedId } }))}
          >
            txn:{linked.linkedId}
          </button>
        )}
        {extractMessageTopic(message) && <span>topic:{extractMessageTopic(message)}</span>}
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
          activeReplyTarget={activeReplyTarget}
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
  const [employees, setEmployees] = useState([]);
  const [selectedEmpids, setSelectedEmpids] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [networkState, setNetworkState] = useState('loading');
  const [error, setError] = useState('');
  const [composerAnnouncement, setComposerAnnouncement] = useState('');
  const [dragOverComposer, setDragOverComposer] = useState(false);
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
        const res = await fetch(`${API_BASE}/messaging/messages?${params.toString()}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        const data = await res.json();
        if (disposed) return;
        const incomingMessages = Array.isArray(data.items) ? data.items : Array.isArray(data.messages) ? data.messages : [];
        setMessagesByCompany((prev) => ({ ...prev, [getCompanyCacheKey(activeCompany)]: incomingMessages }));
        setPresence(Array.isArray(data.onlineUsers) ? data.onlineUsers : []);
        setNetworkState('ready');
      } catch (err) {
        if (disposed) return;
        setNetworkState('error');
        setError(err.message || 'Messaging unavailable');
      }
    };
    const loadEmployees = async () => {
      try {
        const params = new URLSearchParams({ perPage: '500', company_id: String(activeCompany) });
        const res = await fetch(`${API_BASE}/tables/tbl_employee?${params.toString()}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
        setEmployees(rows.map((row) => ({
          empid: normalizeId(row.emp_id || row.empid || row.id),
          name: row.emp_name || row.employee_name || row.name || row.full_name || row.emp_id,
        })).filter((row) => row.empid));
      } catch {
        // Optional enhancement only; keep widget functional.
      }
    };
    load();
    loadEmployees();
    return () => {
      disposed = true;
    };
  }, [companyId, state.activeCompanyId]);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (payload) => {
      const nextMessage = payload?.message || payload;
      if (normalizeId(nextMessage?.company_id || nextMessage?.companyId) !== (state.activeCompanyId || companyId)) return;
      setMessagesByCompany((prev) => {
        const key = getCompanyCacheKey(state.activeCompanyId || companyId);
        return { ...prev, [key]: [...(prev[key] || []), nextMessage] };
      });
    };
    const onPresence = (payload) => {
      setPresence(Array.isArray(payload?.onlineUsers) ? payload.onlineUsers : []);
    };
    socket.on('messages:new', onNew);
    socket.on('message.created', onNew);
    socket.on('thread.reply.created', onNew);
    socket.on('messages:presence', onPresence);
    socket.on('presence.changed', onPresence);
    return () => {
      socket.off('messages:new', onNew);
      socket.off('message.created', onNew);
      socket.off('thread.reply.created', onNew);
      socket.off('messages:presence', onPresence);
      socket.off('presence.changed', onPresence);
      disconnectSocket();
    };
  }, [state.activeCompanyId, companyId]);

  useEffect(() => {
    const onStartMessage = (event) => {
      const detail = event?.detail || {};
      dispatch({
        type: 'composer/start',
        payload: {
          topic: detail.topic,
          recipients: detail.recipientEmpids || [],
          linkedType: detail.transaction?.id ? 'transaction' : null,
          linkedId: detail.transaction?.id ? String(detail.transaction.id) : null,
        },
      });
      if (Array.isArray(detail.recipientEmpids)) {
        setSelectedEmpids(Array.from(new Set(detail.recipientEmpids.map(normalizeId).filter(Boolean))));
      }
    };
    window.addEventListener('messaging:start', onStartMessage);
    return () => window.removeEventListener('messaging:start', onStartMessage);
  }, []);

  const conversations = useMemo(() => groupConversations(messages), [messages]);
  const activeConversationId = state.activeConversationId || conversations[0]?.id || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const threadMessages = useMemo(() => buildNestedThreads(activeConversation?.messages || []), [activeConversation]);
  const messageMap = useMemo(() => new Map(messages.map((msg) => [msg.id, msg])), [messages]);

  const unreadCount = messages.filter((msg) => !msg.read_by?.includes?.(selfEmpid)).length;
  const presenceMap = useMemo(
    () => new Map(presence.map((entry) => [normalizeId(entry.empid || entry.id), resolvePresence(entry)])),
    [presence],
  );
  const employeeRecords = useMemo(() => {
    const seen = new Map();
    employees.forEach((entry) => {
      seen.set(entry.empid, {
        id: entry.empid,
        label: sanitizeMessageText(entry.name || entry.empid) || entry.empid,
        status: presenceMap.get(entry.empid) || PRESENCE.OFFLINE,
      });
    });
    messages.forEach((msg) => {
      const empid = normalizeId(msg.author_empid);
      if (!empid || seen.has(empid)) return;
      seen.set(empid, { id: empid, label: empid, status: presenceMap.get(empid) || PRESENCE.OFFLINE });
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, messages, presenceMap]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employeeRecords;
    const query = employeeSearch.trim().toLowerCase();
    return employeeRecords.filter((entry) => entry.label.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query));
  }, [employeeRecords, employeeSearch]);

  const activeTopic = state.composer.topic || activeConversation?.title || 'Untitled topic';

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
      linkedType: state.composer.linkedType || activeConversation?.linkedType || null,
      linkedId: state.composer.linkedId || activeConversation?.linkedId || null,
      topic: sanitizeMessageText(activeTopic),
      recipientEmpids: state.composer.recipients,
      mentions: Array.from(new Set((safeBody.match(/@[A-Za-z0-9_.-]+/g) || []).map((token) => token.slice(1)))),
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      attachments: state.composer.attachments.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    };
    const res = await fetch(`${API_BASE}/messaging/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      dispatch({ type: 'composer/reset' });
      setComposerAnnouncement('Message sent.');
      composerRef.current?.focus();
    } else {
      const errorPayload = await res.json().catch(() => null);
      setComposerAnnouncement(errorPayload?.message || 'Failed to send message.');
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

  const startNewMessage = () => {
    dispatch({
      type: 'composer/start',
      payload: {
        recipients: selectedEmpids,
        topic: state.composer.topic || '',
      },
    });
    setComposerAnnouncement(selectedEmpids.length ? `Draft started for ${selectedEmpids.length} participant(s).` : 'Draft started.');
    composerRef.current?.focus();
  };

  const onDropTransaction = (event) => {
    event.preventDefault();
    setDragOverComposer(false);
    const raw = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain') || '';
    if (!raw) return;
    let transactionId = null;
    try {
      const parsed = JSON.parse(raw);
      transactionId = normalizeId(parsed?.transaction?.id || parsed?.id || parsed?.rowId);
    } catch {
      const match = raw.match(/\d+/);
      transactionId = normalizeId(match?.[0]);
    }
    if (!transactionId) return;
    dispatch({ type: 'composer/setLinkedContext', payload: { linkedType: 'transaction', linkedId: transactionId } });
    setComposerAnnouncement(`Linked transaction #${transactionId} to this message.`);
  };

  if (!state.isOpen) {
    return (
      <section style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200 }}>
        <button type="button" aria-label="Open messaging widget" onClick={() => dispatch({ type: 'widget/open' })}>
          💬 Messages {unreadCount > 0 ? `(${unreadCount})` : ''}
        </button>
      </section>
    );
  }

  return (
    <section
      style={{ position: 'fixed', right: 16, bottom: 16, width: 940, maxWidth: '98vw', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, zIndex: 1200 }}
      aria-label="Messaging widget"
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#0f172a', color: '#fff' }}>
        <strong>Messaging</strong>
        <button type="button" onClick={() => dispatch({ type: 'widget/close' })} aria-label="Collapse messaging widget">Collapse</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '270px 220px 1fr 1fr', minHeight: 460 }}>
        <aside style={{ borderRight: '1px solid #e2e8f0', padding: 8 }}>
          <label htmlFor="messaging-company-switch">Company</label>
          <input id="messaging-company-switch" value={state.activeCompanyId || ''} onChange={onSwitchCompany} aria-label="Switch company context" />
          <h4 style={{ margin: '10px 0 6px' }}>Employees</h4>
          <input
            type="search"
            value={employeeSearch}
            onChange={(event) => setEmployeeSearch(event.target.value)}
            placeholder="Search employees"
            aria-label="Search users"
            style={{ width: '100%' }}
          />
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
            {filteredEmployees.map((entry) => (
              <label key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <input
                  type="checkbox"
                  checked={selectedEmpids.includes(entry.id)}
                  onChange={(event) => {
                    setSelectedEmpids((prev) => {
                      if (event.target.checked) return Array.from(new Set([...prev, entry.id]));
                      return prev.filter((id) => id !== entry.id);
                    });
                  }}
                />
                <span style={{ width: 8, height: 8, borderRadius: 4, background: presenceColor(entry.status), display: 'inline-block' }} />
                <span>{entry.label}</span>
              </label>
            ))}
          </div>
          <button type="button" style={{ marginTop: 8, width: '100%' }} onClick={startNewMessage}>
            New message
          </button>
        </aside>

        <aside style={{ borderRight: '1px solid #e2e8f0', padding: 8 }}>
          <h4>Topics</h4>
          {conversations.length === 0 && <p>No conversations yet.</p>}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', background: conversation.id === activeConversationId ? '#e2e8f0' : 'transparent' }}
              onClick={() => {
                dispatch({ type: 'widget/setConversation', payload: conversation.id });
                dispatch({ type: 'composer/setTopic', payload: conversation.title });
                if (conversation.linkedType && conversation.linkedId) {
                  dispatch({ type: 'composer/setLinkedContext', payload: { linkedType: conversation.linkedType, linkedId: conversation.linkedId } });
                }
              }}
            >
              {conversation.title} ({conversation.messages.length})
            </button>
          ))}
        </aside>

        <main style={{ borderRight: '1px solid #e2e8f0', padding: 8, overflowY: 'auto' }} aria-live="polite">
          <div style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '4px 0', marginBottom: 8 }}>
            <strong>Topic: {activeTopic}</strong>
          </div>
          {networkState === 'loading' && <p>Loading messages…</p>}
          {networkState === 'error' && <p role="alert">{error}</p>}
          {networkState === 'ready' && threadMessages.length === 0 && <p>No messages in this thread.</p>}
          {threadMessages.map((message) => (
            <MessageNode
              key={message.id}
              message={message}
              parentMap={messageMap}
              permissions={permissions || {}}
              activeReplyTarget={state.composer.replyToId}
              onReply={(id) => {
                dispatch({ type: 'composer/setReplyTo', payload: id });
                setComposerAnnouncement(`Reply target set to #${id}.`);
              }}
              onJumpToParent={(parentId) => document.querySelector(`[aria-label='Message ${parentId}']`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />
          ))}
        </main>

        <form
          style={{ padding: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverComposer(true);
          }}
          onDragLeave={() => setDragOverComposer(false)}
          onDrop={onDropTransaction}
        >
          <label htmlFor="messaging-topic">Topic</label>
          <input
            id="messaging-topic"
            value={state.composer.topic}
            onChange={(event) => dispatch({ type: 'composer/setTopic', payload: event.target.value })}
            placeholder="Topic"
            aria-label="Topic"
            style={{ width: '100%' }}
          />
          <label htmlFor="messaging-recipients" style={{ marginTop: 6, display: 'block' }}>Recipients</label>
          <select
            id="messaging-recipients"
            multiple
            value={state.composer.recipients}
            onChange={(event) => {
              const values = Array.from(event.target.selectedOptions || []).map((opt) => normalizeId(opt.value)).filter(Boolean);
              dispatch({ type: 'composer/setRecipients', payload: values });
            }}
            style={{ width: '100%', minHeight: 70 }}
          >
            {employeeRecords.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label} ({entry.status})</option>
            ))}
          </select>
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
            style={dragOverComposer ? { border: '2px dashed #f97316' } : undefined}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {(state.composer.recipients.length ? state.composer.recipients : employeeRecords.slice(0, 8).map((entry) => entry.id)).map((empid) => (
              <button
                key={empid}
                type="button"
                onClick={() => dispatch({ type: 'composer/setBody', payload: `${state.composer.body}${state.composer.body ? ' ' : ''}@${empid}` })}
              >
                @{empid}
              </button>
            ))}
          </div>
          <div>{state.composer.replyToId ? `Replying to #${state.composer.replyToId}` : 'New message'}</div>
          {(state.composer.linkedType === 'transaction' && state.composer.linkedId) && (
            <div style={{ marginTop: 4 }}>
              Linked transaction: <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('messaging:open-transaction', { detail: { id: state.composer.linkedId } }))}>#{state.composer.linkedId}</button>
            </div>
          )}
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
