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

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: PRESENCE.ONLINE, label: 'Online' },
  { value: PRESENCE.OFFLINE, label: 'Offline' },
];

function highlightMentions(text) {
  const raw = sanitizeMessageText(text || '');
  if (!raw) return [<span key="empty">Empty message</span>];
  return raw.split(/(@[A-Za-z0-9_.-]+)/g).map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('@')) {
      return <mark key={`${part}-${idx}`} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '0 2px' }}>{part}</mark>;
    }
    return <span key={`${part}-${idx}`}>{part}</span>;
  }).filter(Boolean);
}

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
  if (status === PRESENCE.ONLINE || status === PRESENCE.AWAY || status === PRESENCE.OFFLINE) return status;
  return record?.last_seen_at ? PRESENCE.AWAY : PRESENCE.OFFLINE;
}

function presenceColor(status) {
  if (status === PRESENCE.ONLINE) return '#22c55e';
  if (status === PRESENCE.AWAY) return '#f59e0b';
  return '#94a3b8';
}

function initialsForLabel(label) {
  const safe = sanitizeMessageText(label || '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatLastActivity(value) {
  if (!value) return 'No activity yet';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'No activity yet';
  return dt.toLocaleString();
}

function canOpenContextLink(permissions, chipType) {
  const allow = permissions?.messaging?.linkedContext?.[chipType];
  if (typeof allow === 'boolean') return allow;
  return permissions?.isAdmin === true;
}

function formatEmployeeOption(entry) {
  return `${entry.label} (ID #${entry.id})`;
}

function canViewTransaction(transactionId, userId, permissions) {
  if (!transactionId || !userId) return false;
  if (permissions?.isAdmin === true) return true;
  if (permissions?.transactions?.view === true) return true;
  return canOpenContextLink(permissions, 'transaction');
}

function MessageNode({ message, depth = 0, onReply, onJumpToParent, onToggleReplies, collapsedMessageIds, parentMap, permissions, activeReplyTarget, highlightedIds, onOpenLinkedTransaction }) {
  const replyCount = countNestedReplies(message);
  const safeBody = sanitizeMessageText(message.body);
  const linked = extractContextLink(message);
  const hasReplies = Array.isArray(message.replies) && message.replies.length > 0;
  const isCollapsed = collapsedMessageIds.has(message.id);
  const isReplyTarget = activeReplyTarget && Number(activeReplyTarget) === Number(message.id);
  const isHighlighted = highlightedIds.has(message.id);
  const readers = Array.isArray(message.read_by) ? message.read_by.filter(Boolean) : [];

  return (
    <article
      aria-label={`Message ${message.id}`}
      style={{
        border: `1px solid ${isReplyTarget ? '#f97316' : '#e2e8f0'}`,
        borderLeftWidth: 4,
        borderRadius: 12,
        background: isReplyTarget ? '#fff7ed' : isHighlighted ? '#ecfeff' : '#ffffff',
        boxShadow: isHighlighted ? '0 0 0 2px #22d3ee inset' : 'none',
        padding: 12,
        marginBottom: 10,
        marginLeft: depth > 0 ? Math.min(depth * 18, 72) : 0,
      }}
    >
      <header style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
        {message.author_empid} · {new Date(message.created_at).toLocaleString()}
      </header>
      <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0', color: '#0f172a', fontSize: 15 }}>{highlightMentions(safeBody)}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {linked.linkedType === 'transaction' && linked.linkedId && (
          <button
            type="button"
            disabled={!canOpenContextLink(permissions, 'transaction')}
            aria-label={`Open transaction ${linked.linkedId}`}
            onClick={() => onOpenLinkedTransaction(linked.linkedId)}
          >
            txn:{linked.linkedId}
          </button>
        )}
        {extractMessageTopic(message) && <span style={{ fontSize: 12, color: '#334155' }}>topic:{extractMessageTopic(message)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onReply(message.id)} aria-label={`Reply to message ${message.id}`}>Reply</button>
        {message.parent_message_id && parentMap.has(message.parent_message_id) && (
          <button type="button" onClick={() => onJumpToParent(message.parent_message_id)} aria-label="Jump to parent message">
            Jump to parent
          </button>
        )}
        {replyCount > 0 && <span aria-label="Nested reply count" style={{ fontSize: 12, color: '#64748b' }}>{replyCount} replies</span>}
        {hasReplies && (
          <button type="button" onClick={() => onToggleReplies(message.id)} aria-label={isCollapsed ? 'Expand replies' : 'Collapse replies'}>
            {isCollapsed ? `Show replies (${message.replies.length})` : 'Hide replies'}
          </button>
        )}
      </div>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: '#64748b' }}>
        Read receipts: {readers.length > 0 ? readers.join(', ') : 'Unread'}
      </p>
      {!isCollapsed && message.replies.map((child) => (
        <MessageNode
          key={child.id}
          message={child}
          depth={depth + 1}
          onReply={onReply}
          onJumpToParent={onJumpToParent}
          onToggleReplies={onToggleReplies}
          collapsedMessageIds={collapsedMessageIds}
          parentMap={parentMap}
          permissions={permissions}
          activeReplyTarget={activeReplyTarget}
          highlightedIds={highlightedIds}
          onOpenLinkedTransaction={onOpenLinkedTransaction}
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
  const [recipientSearch, setRecipientSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all');
  const [presencePanelOpen, setPresencePanelOpen] = useState(true);
  const [highlightedIds, setHighlightedIds] = useState(() => new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [networkState, setNetworkState] = useState('loading');
  const [error, setError] = useState('');
  const [composerAnnouncement, setComposerAnnouncement] = useState('');
  const [dragOverComposer, setDragOverComposer] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [collapsedMessageIds, setCollapsedMessageIds] = useState(() => new Set());
  const composerRef = useRef(null);

  const draftStorageKey = useMemo(() => {
    const convKey = state.activeConversationId || 'new';
    return `messaging-widget:draft:${normalizeId(sessionId) || 'anonymous'}:${normalizeId(state.activeCompanyId || companyId) || 'none'}:${convKey}`;
  }, [sessionId, state.activeConversationId, state.activeCompanyId, companyId]);

  const cacheKey = getCompanyCacheKey(state.activeCompanyId || companyId);
  const messages = messagesByCompany[cacheKey] || [];

  useEffect(() => {
    globalThis.sessionStorage?.setItem(sessionOpenKey, state.isOpen ? '1' : '0');
  }, [state.isOpen, sessionOpenKey]);

  useEffect(() => {
    if (state.activeConversationId) globalThis.sessionStorage?.setItem(sessionConversationKey, String(state.activeConversationId));
  }, [state.activeConversationId, sessionConversationKey]);

  useEffect(() => {
    const nextCompany = companyId || state.activeCompanyId;
    if (nextCompany) globalThis.sessionStorage?.setItem(sessionCompanyKey, String(nextCompany));
  }, [companyId, state.activeCompanyId, sessionCompanyKey]);

  useEffect(() => {
    if (!companyId || state.activeCompanyId === companyId) return;
    dispatch({ type: 'company/switch', payload: companyId });
    setPresence([]);
    setError('');
    setNetworkState('loading');
  }, [companyId, state.activeCompanyId]);

  useEffect(() => {
    const raw = globalThis.localStorage?.getItem(draftStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.body === 'string') dispatch({ type: 'composer/setBody', payload: parsed.body });
      if (typeof parsed.topic === 'string') dispatch({ type: 'composer/setTopic', payload: parsed.topic });
      if (Array.isArray(parsed.recipients)) dispatch({ type: 'composer/setRecipients', payload: parsed.recipients });
    } catch {
      // Ignore corrupt draft.
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const payload = JSON.stringify({
      body: state.composer.body,
      topic: state.composer.topic,
      recipients: state.composer.recipients,
    });
    globalThis.localStorage?.setItem(draftStorageKey, payload);
  }, [draftStorageKey, state.composer.body, state.composer.topic, state.composer.recipients]);

  useEffect(() => {
    const activeCompany = state.activeCompanyId || companyId;
    if (!activeCompany) return;
    let disposed = false;

    const loadMessages = async () => {
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
        const employmentParams = new URLSearchParams({ perPage: '1000', company_id: String(activeCompany) });
        const employmentRes = await fetch(`${API_BASE}/tables/tbl_employment?${employmentParams.toString()}`, { credentials: 'include' });
        if (!employmentRes.ok) return;
        const employmentData = await employmentRes.json();
        const employmentRows = Array.isArray(employmentData?.rows) ? employmentData.rows : Array.isArray(employmentData) ? employmentData : [];
        const idsFromEmployment = Array.from(
          new Set(
            employmentRows
              .map((row) => normalizeId(row.employment_emp_id || row.emp_id || row.empid || row.id))
              .filter(Boolean),
          ),
        );
        if (idsFromEmployment.length === 0) {
          setEmployees([]);
          return;
        }

        const employeeParams = new URLSearchParams({ perPage: '1000' });
        const employeeRes = await fetch(`${API_BASE}/tables/tbl_employee?${employeeParams.toString()}`, { credentials: 'include' });
        const employeeData = employeeRes.ok ? await employeeRes.json() : { rows: [] };
        const employeeRows = Array.isArray(employeeData?.rows) ? employeeData.rows : Array.isArray(employeeData) ? employeeData : [];
        const profileMap = new Map(employeeRows.map((row) => [
          normalizeId(row.emp_id || row.empid || row.id),
          row.emp_name || row.employee_name || row.name || row.full_name || row.emp_id,
        ]));

        setEmployees(idsFromEmployment.map((empid) => ({
          empid,
          name: profileMap.get(empid) || empid,
        })));
      } catch {
        // Optional enhancement only; keep widget functional.
      }
    };

    loadMessages();
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
      if (nextMessage?.parent_message_id || nextMessage?.parentMessageId) {
        const id = nextMessage.id;
        setHighlightedIds((prev) => new Set([...prev, id]));
        setTimeout(() => {
          setHighlightedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 2400);
      }
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
        dispatch({ type: 'composer/setRecipients', payload: Array.from(new Set(detail.recipientEmpids.map(normalizeId).filter(Boolean))) });
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


  useEffect(() => {
    if (state.composer.attachments.length > 0) setAttachmentsOpen(true);
  }, [state.composer.attachments.length]);

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
    if (!recipientSearch.trim()) return employeeRecords;
    const query = recipientSearch.trim().toLowerCase();
    return employeeRecords.filter((entry) => entry.label.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query));
  }, [employeeRecords, recipientSearch]);

  const presenceEmployees = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    return employeeRecords.filter((entry) => {
      const matchesQuery = !query || entry.label.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (employeeStatusFilter === PRESENCE.ONLINE) return entry.status === PRESENCE.ONLINE;
      if (employeeStatusFilter === PRESENCE.OFFLINE) return entry.status === PRESENCE.OFFLINE || entry.status === PRESENCE.AWAY;
      return true;
    });
  }, [employeeRecords, employeeStatusFilter, recipientSearch]);

  const conversationSummaries = useMemo(() => conversations.map((conversation) => {
    const previewMessage = conversation.messages.at(-1);
    return {
      ...conversation,
      unread: conversation.messages.filter((msg) => !msg.read_by?.includes?.(selfEmpid)).length,
      preview: sanitizeMessageText(previewMessage?.body || '').slice(0, 75) || 'No messages yet',
      groupName: conversation.linkedType && conversation.linkedId ? `${conversation.linkedType} #${conversation.linkedId}` : 'General topic',
      lastActivity: previewMessage?.created_at || null,
    };
  }), [conversations, selfEmpid]);

  const activeTopic = state.composer.topic || activeConversation?.title || 'Untitled topic';


  const safeTopic = sanitizeMessageText(state.composer.topic || activeConversation?.title || '');
  const safeBody = sanitizeMessageText(state.composer.body);
  const canSendMessage = Boolean(safeTopic && safeBody && state.composer.recipients.length > 0);

  const handleOpenLinkedTransaction = (transactionId) => {
    if (canViewTransaction(transactionId, normalizeId(sessionId), permissions || {})) {
      window.dispatchEvent(new CustomEvent('messaging:open-transaction', { detail: { id: transactionId } }));
      return;
    }
    setComposerAnnouncement(`You do not have permission to view transaction #${transactionId}.`);
  };

  const toggleMessageReplies = (messageId) => {
    setCollapsedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const mentionCandidates = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    return employeeRecords
      .filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query))
      .slice(0, 8);
  }, [employeeRecords, mentionQuery]);

  const sendMessage = async () => {
    if (!safeTopic) {
      setComposerAnnouncement('Topic is required.');
      return;
    }
    if (!safeBody) {
      setComposerAnnouncement('Cannot send an empty message.');
      return;
    }
    if (state.composer.recipients.length === 0) {
      setComposerAnnouncement('Select at least one recipient.');
      return;
    }

    const activeCompany = state.activeCompanyId || companyId;
    const payload = {
      body: `[${safeTopic}] ${safeBody}`,
      companyId: Number.isFinite(Number(activeCompany)) ? Number(activeCompany) : String(activeCompany),
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      ...(state.composer.linkedType || activeConversation?.linkedType ? { linkedType: state.composer.linkedType || activeConversation?.linkedType } : {}),
      ...(state.composer.linkedId || activeConversation?.linkedId ? { linkedId: String(state.composer.linkedId || activeConversation?.linkedId) } : {}),
    };

    const targetUrl = state.composer.replyToId
      ? `${API_BASE}/messaging/messages/${state.composer.replyToId}/reply`
      : `${API_BASE}/messaging/messages`;

    const res = await fetch(targetUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      dispatch({ type: 'composer/reset' });
      globalThis.localStorage?.removeItem(draftStorageKey);
      setRecipientSearch('');
      setComposerAnnouncement('Message sent.');
      composerRef.current?.focus();
    } else {
      const errorPayload = await res.json().catch(() => null);
      console.error('Messaging send failed', { status: res.status, errorPayload, payload });
      setComposerAnnouncement(errorPayload?.error?.message || errorPayload?.message || 'Failed to send message.');
    }
  };

  const addFiles = (incomingFiles) => {
    const safe = Array.from(incomingFiles || []).filter(safePreviewableFile);
    const merged = new Map(state.composer.attachments.map((file) => [`${file.name}-${file.size}-${file.lastModified || 0}`, file]));
    safe.forEach((file) => {
      merged.set(`${file.name}-${file.size}-${file.lastModified || 0}`, file);
    });
    const nextFiles = Array.from(merged.values());
    dispatch({ type: 'composer/setAttachments', payload: nextFiles });
    setComposerAnnouncement(safe.length ? `${safe.length} attachment(s) added.` : 'No safe files selected.');
  };

  const onAttach = (event) => {
    addFiles(event.target.files || []);
    event.target.value = '';
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

  const onDropComposer = (event) => {
    event.preventDefault();
    setDragOverComposer(false);

    const transfer = event.dataTransfer;
    if (transfer?.files?.length) {
      addFiles(transfer.files);
      return;
    }

    const raw = transfer?.getData('application/json') || transfer?.getData('text/plain') || '';
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

  const onChooseRecipient = (id) => {
    if (!id || state.composer.recipients.includes(id)) return;
    dispatch({ type: 'composer/setRecipients', payload: [...state.composer.recipients, id] });
    setRecipientSearch('');
  };

  const openNewMessage = () => {
    dispatch({ type: 'composer/setTopic', payload: '' });
    dispatch({ type: 'composer/setBody', payload: '' });
    dispatch({ type: 'composer/setReplyTo', payload: null });
    setComposerAnnouncement('Started a new message draft. Add a topic and message body.');
  };

  const onComposerInput = (event) => {
    const value = event.target.value;
    dispatch({ type: 'composer/setBody', payload: value });
    const caret = event.target.selectionStart || value.length;
    const left = value.slice(0, caret);
    const mentionMatch = left.match(/(^|\s)@([A-Za-z0-9_.-]*)$/);
    if (!mentionMatch) {
      setMentionOpen(false);
      setMentionQuery('');
      setMentionStart(-1);
      return;
    }
    setMentionOpen(true);
    setMentionQuery(mentionMatch[2] || '');
    setMentionStart(caret - mentionMatch[2].length - 1);
  };

  const insertMention = (empid) => {
    if (mentionStart < 0) return;
    const body = state.composer.body;
    const cursor = composerRef.current?.selectionStart || body.length;
    const nextBody = `${body.slice(0, mentionStart)}@${empid} ${body.slice(cursor)}`;
    dispatch({ type: 'composer/setBody', payload: nextBody });
    setMentionOpen(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      const nextPos = mentionStart + empid.length + 2;
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextPos, nextPos);
    });
  };

  const onRemoveRecipient = (id) => {
    dispatch({ type: 'composer/setRecipients', payload: state.composer.recipients.filter((entry) => entry !== id) });
  };

  if (!state.isOpen) {
    return (
      <section style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200 }}>
        <button
          type="button"
          aria-label="Open messaging widget"
          onClick={() => dispatch({ type: 'widget/open' })}
          style={{ borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', padding: '10px 14px', fontWeight: 600 }}
        >
          💬 Messages {unreadCount > 0 ? `(${unreadCount})` : ''}
        </button>
      </section>
    );
  }

  return (
    <section
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 1080,
        maxWidth: '98vw',
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: 14,
        zIndex: 1200,
        overflow: 'hidden',
      }}
      aria-label="Messaging widget"
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0f172a', color: '#fff' }}>
        <div>
          <strong style={{ fontSize: 16 }}>Messaging</strong>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#cbd5e1' }}>{unreadCount} unread across all threads</p>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'widget/close' })}
          aria-label="Collapse messaging widget"
          style={{ border: '1px solid rgba(148, 163, 184, 0.7)', borderRadius: 8, background: 'transparent', color: '#e2e8f0', padding: '6px 10px', fontSize: 12 }}
        >
          Collapse
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', minHeight: 560 }}>
        <aside style={{ borderRight: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
            <label htmlFor="messaging-company-switch" style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Company</label>
            <input
              id="messaging-company-switch"
              value={state.activeCompanyId || ''}
              onChange={onSwitchCompany}
              aria-label="Switch company context"
              style={{ width: '100%', marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px' }}
            />
          </div>

          <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Topics</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Grouped by topic or linked entity.</p>
          </div>

          <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
            <button type="button" onClick={() => setPresencePanelOpen((prev) => !prev)} style={{ border: 0, background: 'transparent', fontWeight: 700, color: '#0f172a', padding: 0 }}>
              {presencePanelOpen ? '▾' : '▸'} Employee presence
            </button>
            {presencePanelOpen && (
              <div style={{ marginTop: 8 }}>
                <input
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  placeholder="Search by name or employee ID"
                  aria-label="Search employees"
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setEmployeeStatusFilter(filter.value)}
                      style={{
                        borderRadius: 999,
                        border: employeeStatusFilter === filter.value ? '1px solid #2563eb' : '1px solid #cbd5e1',
                        background: employeeStatusFilter === filter.value ? '#eff6ff' : '#fff',
                        padding: '4px 8px',
                        fontSize: 11,
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4 }}>
                  {presenceEmployees.slice(0, 40).map((entry) => {
                    const selected = state.composer.recipients.includes(entry.id);
                    return (
                      <button key={entry.id} type="button" onClick={() => (selected ? onRemoveRecipient(entry.id) : onChooseRecipient(entry.id))} style={{ display: 'flex', alignItems: 'center', gap: 8, border: selected ? '1px solid #2563eb' : '1px solid #e2e8f0', borderRadius: 8, background: selected ? '#eff6ff' : '#fff', padding: '6px 8px', textAlign: 'left' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: presenceColor(entry.status) }} />
                        <span style={{ fontSize: 12, color: '#0f172a' }}>{formatEmployeeOption(entry)}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569', borderRadius: 999, padding: '2px 8px', background: '#f1f5f9' }}>{entry.status}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" disabled={state.composer.recipients.length === 0} onClick={openNewMessage} style={{ marginTop: 8, border: 0, borderRadius: 8, background: state.composer.recipients.length ? '#2563eb' : '#94a3b8', color: '#fff', padding: '8px 10px', width: '100%' }}>
                  New message
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowY: 'auto', padding: 10, display: 'grid', gap: 8 }}>
            {conversationSummaries.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No conversations yet.</p>}
            {conversationSummaries.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  dispatch({ type: 'widget/setConversation', payload: conversation.id });
                  dispatch({ type: 'composer/setTopic', payload: conversation.title });
                  if (conversation.linkedType && conversation.linkedId) {
                    dispatch({ type: 'composer/setLinkedContext', payload: { linkedType: conversation.linkedType, linkedId: conversation.linkedId } });
                  }
                }}
                style={{
                  textAlign: 'left',
                  borderRadius: 12,
                  border: conversation.id === activeConversationId ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                  background: conversation.id === activeConversationId ? '#eff6ff' : '#ffffff',
                  padding: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ color: '#0f172a', fontSize: 14 }}>{conversation.title}</strong>
                  {conversation.unread > 0 && (
                    <span style={{ minWidth: 22, textAlign: 'center', borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 12, padding: '2px 6px' }}>
                      {conversation.unread}
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0', fontSize: 12, color: '#334155' }}>{conversation.preview}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>
                  {conversation.groupName} · Last active: {formatLastActivity(conversation.lastActivity)}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section style={{ display: 'grid', gridTemplateRows: 'minmax(420px, 1fr) auto', minWidth: 0, minHeight: 0 }}>
          <main style={{ padding: '10px 14px 8px', overflowY: 'auto', minHeight: 420 }} aria-live="polite">
            <div style={{ position: 'sticky', top: 0, background: '#f8fafc', paddingBottom: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 16, color: '#0f172a' }}>{activeTopic}</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Ctrl/Cmd + Enter sends your message.</p>
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
                  document.querySelector(`[aria-label='Message ${id}']`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setComposerAnnouncement(`Reply target set to #${id}.`);
                }}
                onJumpToParent={(parentId) => document.querySelector(`[aria-label='Message ${parentId}']`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                onToggleReplies={toggleMessageReplies}
                collapsedMessageIds={collapsedMessageIds}
                highlightedIds={highlightedIds}
                onOpenLinkedTransaction={handleOpenLinkedTransaction}
              />
            ))}
          </main>

          <form
            style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff', padding: 12, position: 'sticky', bottom: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverComposer(true);
            }}
            onDragLeave={() => setDragOverComposer(false)}
            onDrop={onDropComposer}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="messaging-topic" style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Topic</label>
                <input
                  id="messaging-topic"
                  value={state.composer.topic}
                  onChange={(event) => dispatch({ type: 'composer/setTopic', payload: event.target.value })}
                  required
                  placeholder="Enter a topic"
                  aria-label="Topic"
                  style={{ width: '100%', marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1', padding: '9px 10px' }}
                />
              </div>

              <div style={{ position: 'relative' }}>
                <label htmlFor="messaging-add-recipient" style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Add recipient</label>
                <input
                  id="messaging-add-recipient"
                  type="search"
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  placeholder="Search by name or employee ID"
                  aria-label="Add recipient"
                  style={{ width: '100%', marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1', padding: '9px 10px' }}
                />
                {recipientSearch.trim() && (
                  <div style={{ position: 'absolute', zIndex: 20, top: 62, left: 0, right: 0, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', maxHeight: 180, overflowY: 'auto' }}>
                    {filteredEmployees.slice(0, 8).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onChooseRecipient(entry.id)}
                        style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <span style={{ width: 24, height: 24, borderRadius: 12, background: '#e2e8f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#334155', fontWeight: 700 }}>
                          {initialsForLabel(entry.label)}
                        </span>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: presenceColor(entry.status) }} aria-hidden="true" />
                        <span style={{ fontSize: 13, color: '#0f172a' }}>{formatEmployeeOption(entry)}</span>
                      </button>
                    ))}
                    {filteredEmployees.length === 0 && <p style={{ margin: 0, padding: 10, color: '#64748b', fontSize: 12 }}>No matches</p>}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {state.composer.recipients.map((empid) => {
                const found = employeeRecords.find((entry) => entry.id === empid);
                const label = found?.label || empid;
                const status = found?.status || PRESENCE.OFFLINE;
                return (
                  <span key={empid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1', borderRadius: 999, padding: '4px 10px', background: '#f8fafc' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {initialsForLabel(label)}
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: presenceColor(status) }} />
                    <span style={{ fontSize: 12, color: '#1e293b' }}>{label} (ID #{empid})</span>
                    <button type="button" aria-label={`Remove recipient ${label}`} onClick={() => onRemoveRecipient(empid)} style={{ border: 0, background: 'transparent', color: '#64748b' }}>×</button>
                  </span>
                );
              })}
            </div>

            <label htmlFor="messaging-composer" style={{ marginTop: 10, display: 'block', fontSize: 12, fontWeight: 600, color: '#334155' }}>
              Message
            </label>
            <textarea
              id="messaging-composer"
              ref={composerRef}
              value={state.composer.body}
              onChange={onComposerInput}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              rows={6}
              placeholder="Type a message…"
              aria-label="Message composer"
              style={{
                width: '100%',
                marginTop: 6,
                borderRadius: 12,
                border: dragOverComposer ? '2px dashed #f97316' : '2px dashed #cbd5e1',
                padding: '10px 12px',
                fontSize: 15,
              }}
            />

            {mentionOpen && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, marginTop: 6, background: '#fff', maxHeight: 180, overflowY: 'auto' }}>
                {mentionCandidates.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => insertMention(entry.id)} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: presenceColor(entry.status) }} />
                    <span style={{ fontSize: 13 }}>{entry.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>@{entry.id}</span>
                  </button>
                ))}
                {mentionCandidates.length === 0 && <p style={{ margin: 0, padding: 10, fontSize: 12, color: '#64748b' }}>No people found for mention.</p>}
              </div>
            )}

            <p title="Drag files to attach, or drag a transaction ID to link context." style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>Tip: drag files or a transaction ID here.</p>

            {state.composer.replyToId && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#475569' }}>
                Replying to #{state.composer.replyToId}
              </p>
            )}

            {(state.composer.linkedType === 'transaction' && state.composer.linkedId) && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#475569' }}>
                Linked transaction:
                {' '}
                <button
                  type="button"
                  title={canViewTransaction(state.composer.linkedId, normalizeId(sessionId), permissions || {}) ? 'Open linked transaction' : 'You do not have permission for this transaction'}
                  onClick={() => handleOpenLinkedTransaction(state.composer.linkedId)}
                >
                  #{state.composer.linkedId}
                </button>
              </p>
            )}

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setAttachmentsOpen((prev) => !prev)}
                style={{ border: 0, background: 'transparent', padding: 0, fontSize: 12, fontWeight: 600, color: '#334155' }}
              >
                {attachmentsOpen ? '▾' : '▸'} Attachments {state.composer.attachments.length > 0 ? `(${state.composer.attachments.length})` : ''}
              </button>
              {attachmentsOpen && (
                <>
                  <input
                    id="messaging-attachments"
                    type="file"
                    multiple
                    onChange={onAttach}
                    aria-label="Attachment picker"
                    style={{ display: 'block', marginTop: 6 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}>
                    {state.composer.attachments.map((file) => (
                      <div key={`${file.name}-${file.lastModified}-${file.size}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                        <strong style={{ display: 'block', fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</strong>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => dispatch({ type: 'composer/reset' })} style={{ border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', padding: '8px 10px' }}>
                Clear draft
              </button>
              <button type="submit" disabled={!canSendMessage} style={{ border: 0, borderRadius: 8, background: canSendMessage ? '#2563eb' : '#94a3b8', color: '#fff', padding: '8px 14px', fontWeight: 600, cursor: canSendMessage ? 'pointer' : 'not-allowed' }}>
                Send
              </button>
            </div>
            <p aria-live="assertive" style={{ fontSize: 12, marginBottom: 0 }}>{composerAnnouncement}</p>
          </form>
        </section>
      </div>
    </section>
  );
}
