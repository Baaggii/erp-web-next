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
  resolvePresenceStatus,
  safePreviewableFile,
  sanitizeMessageText,
} from './messagingWidgetModel.js';


const ATTACHMENTS_MARKER = '\n[attachments-json]';
const NEW_CONVERSATION_ID = '__new__';

function decodeMessageContent(rawBody) {
  const safe = String(rawBody || '');
  const markerIndex = safe.indexOf(ATTACHMENTS_MARKER);
  if (markerIndex < 0) return { text: safe, attachments: [] };
  const text = safe.slice(0, markerIndex).trimEnd();
  const encoded = safe.slice(markerIndex + ATTACHMENTS_MARKER.length).trim();
  if (!encoded) return { text, attachments: [] };
  try {
    const json = globalThis.atob(encoded);
    const parsed = JSON.parse(json);
    const attachments = Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.url === 'string')
      : [];
    return { text, attachments };
  } catch {
    return { text: safe, attachments: [] };
  }
}

function encodeAttachmentPayload(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  try {
    const json = JSON.stringify(items.map((entry) => ({
      name: sanitizeMessageText(entry?.name || ''),
      type: sanitizeMessageText(entry?.type || ''),
      size: Number(entry?.size) || 0,
      url: String(entry?.url || '').trim(),
    })).filter((entry) => entry.url));
    const encoded = globalThis.btoa(json);
    return `${ATTACHMENTS_MARKER}${encoded}`;
  } catch {
    return '';
  }
}

function isImageAttachment(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  const name = String(file?.name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/.test(name)) return true;
  const url = String(file?.url || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?.*)?$/.test(url);
}

function extractMessageAttachments(message) {
  const decoded = decodeMessageContent(message?.body);
  if (decoded.attachments.length > 0) return decoded;
  const fallbackAttachments = Array.isArray(message?.attachments)
    ? message.attachments.filter((entry) => entry && typeof entry.url === 'string')
    : [];
  return { ...decoded, attachments: fallbackAttachments };
}

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
  const directTopic = sanitizeMessageText(message?.topic || '').slice(0, 120);
  if (directTopic) return directTopic;
  const decoded = decodeMessageContent(message?.body || '');
  const inlineTopicMatch = decoded.text.match(/^\[([^\]]{1,120})\]\s+/);
  if (!inlineTopicMatch) return '';
  return sanitizeMessageText(inlineTopicMatch[1] || '').slice(0, 120);
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
  const generalMessages = [];
  const byId = new Map(messages.map((msg) => [String(msg.id), msg]));

  const resolveRootMessageId = (message) => {
    if (!message) return null;
    const conversationId = message.conversation_id || message.conversationId;
    if (conversationId) return Number(conversationId);
    let current = message;
    const visited = new Set();
    while (current) {
      const parentId = current.parent_message_id || current.parentMessageId;
      if (!parentId) return Number(current.id);
      if (visited.has(String(parentId))) return Number(parentId);
      visited.add(String(parentId));
      current = byId.get(String(parentId));
      if (!current) return Number(parentId);
    }
    return null;
  };

  messages.forEach((msg) => {
    const link = extractContextLink(msg);
    const scope = String(msg.visibility_scope || msg.visibilityScope || 'company').toLowerCase();
    const hasTopic = Boolean(extractMessageTopic(msg));
    const isGeneralMessage = !link.linkedType && !link.linkedId && scope === 'company' && !hasTopic;

    if (isGeneralMessage) {
      generalMessages.push(msg);
      return;
    }

    const rootMessageId = resolveRootMessageId(msg);
    if (!rootMessageId) return;
    const rootMessage = byId.get(String(rootMessageId));
    const topic = extractMessageTopic(rootMessage || msg) || extractMessageTopic(msg);
    const rootLink = extractContextLink(rootMessage || msg);
    const key = `message:${rootMessageId}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        title: topic || (rootLink.linkedType === 'transaction' && rootLink.linkedId ? `Transaction #${rootLink.linkedId}` : 'Untitled topic'),
        messages: [],
        linkedType: rootLink.linkedType,
        linkedId: rootLink.linkedId,
        rootMessageId,
      });
    }
    map.get(key).messages.push(msg);
  });

  map.set('general', {
    id: 'general',
    title: 'General',
    messages: generalMessages,
    linkedType: null,
    linkedId: null,
    rootMessageId: null,
    isGeneral: true,
  });

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (a.isGeneral) return -1;
    if (b.isGeneral) return 1;
    const aTime = new Date(a.messages.at(-1)?.created_at || 0).getTime();
    const bTime = new Date(b.messages.at(-1)?.created_at || 0).getTime();
    return bTime - aTime;
  });
  return sorted;
}

function resolvePresence(record) {
  return resolvePresenceStatus(record);
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

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeMessageList(current, incoming) {
  if (!incoming?.id) return current;
  const next = [...(current || [])];
  const existingIdx = next.findIndex((entry) => String(entry.id) === String(incoming.id));
  if (existingIdx >= 0) next[existingIdx] = incoming;
  else next.push(incoming);
  next.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  return next;
}

function canOpenContextLink(permissions, chipType) {
  const allow = permissions?.messaging?.linkedContext?.[chipType];
  if (typeof allow === 'boolean') return allow;
  return permissions?.isAdmin === true;
}

function formatEmployeeOption(entry) {
  return `${entry.label}`;
}

function mergePresenceEntries(entries = []) {
  return Array.from(new Map((entries || []).map((entry) => {
    const empid = normalizeId(entry?.empid || entry?.id);
    return [empid, { ...entry, empid }];
  })).values()).filter((entry) => entry.empid);
}

function getRowValueCaseInsensitive(row, fieldName) {
  if (!row || !fieldName) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, fieldName)) return row[fieldName];
  const target = String(fieldName).toLowerCase();
  const actualKey = Object.keys(row).find((key) => key.toLowerCase() === target);
  return actualKey ? row[actualKey] : undefined;
}

function resolveDisplayLabelFromConfig(row, displayFields = []) {
  if (!row || !Array.isArray(displayFields) || displayFields.length === 0) return '';
  const parts = displayFields
    .map((field) => sanitizeMessageText(getRowValueCaseInsensitive(row, field)))
    .filter(Boolean);
  return parts.join(' ').trim();
}

function collectMessageParticipantEmpids(message) {
  const ids = [];
  ids.push(message?.author_empid, message?.authorEmpid, message?.visibility_empid, message?.visibilityEmpid);
  const recipientEmpids =
    message?.recipient_empids || message?.recipientEmpids || message?.recipient_ids || message?.recipientIds;
  if (Array.isArray(recipientEmpids)) ids.push(...recipientEmpids);
  const readBy = Array.isArray(message?.read_by) ? message.read_by : [];
  ids.push(...readBy);
  return Array.from(new Set(ids.map(normalizeId).filter(Boolean)));
}

function canViewTransaction(transactionId, userId, permissions) {
  if (!transactionId || !userId) return false;
  if (permissions?.isAdmin === true) return true;
  if (permissions?.transactions?.view === true) return true;
  return canOpenContextLink(permissions, 'transaction');
}

function MessageNode({ message, depth = 0, onReply, onJumpToParent, onToggleReplies, collapsedMessageIds, parentMap, permissions, activeReplyTarget, highlightedIds, onOpenLinkedTransaction, resolveEmployeeLabel, canDeleteMessage, onDeleteMessage, onPreviewAttachment }) {
  const replyCount = countNestedReplies(message);
  const decoded = extractMessageAttachments(message);
  const safeBody = sanitizeMessageText(decoded.text);
  const linked = extractContextLink(message);
  const hasReplies = Array.isArray(message.replies) && message.replies.length > 0;
  const isCollapsed = collapsedMessageIds.has(message.id);
  const isReplyTarget = activeReplyTarget && Number(activeReplyTarget) === Number(message.id);
  const isHighlighted = highlightedIds.has(message.id);
  const readers = Array.isArray(message.read_by) ? message.read_by.filter(Boolean) : [];
  const authorLabel = resolveEmployeeLabel(message.author_empid);
  const readerLabels = readers.map((empid) => resolveEmployeeLabel(empid));

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
        {authorLabel} · {new Date(message.created_at).toLocaleString()}
      </header>
      <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0', color: '#0f172a', fontSize: 15 }}>{highlightMentions(safeBody)}</p>
      {decoded.attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {decoded.attachments.map((file) => {
            if (isImageAttachment(file)) {
              return (
                <button
                  key={`${file.url}-${file.name}`}
                  type="button"
                  onClick={() => onPreviewAttachment(file)}
                  style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: 4, cursor: 'pointer' }}
                  aria-label={`Preview image ${file.name || 'attachment'}`}
                >
                  <img
                    src={file.url}
                    alt={file.name || 'attachment thumbnail'}
                    style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                  />
                </button>
              );
            }
            return (
              <a key={`${file.url}-${file.name}`} href={file.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                📎 {file.name || 'attachment'}
              </a>
            );
          })}
        </div>
      )}
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
        {canDeleteMessage(message) && (
          <button type="button" onClick={() => onDeleteMessage(message.id)} aria-label={`Delete message ${message.id}`}>Delete message</button>
        )}
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
        Read receipts: {readerLabels.length > 0 ? readerLabels.join(', ') : 'Unread'}
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
          resolveEmployeeLabel={resolveEmployeeLabel}
          canDeleteMessage={canDeleteMessage}
          onDeleteMessage={onDeleteMessage}
          onPreviewAttachment={onPreviewAttachment}
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
    activeConversationId: (() => {
      const rawConversationId = globalThis.sessionStorage?.getItem(sessionConversationKey);
      if (!rawConversationId) return null;
      if (rawConversationId === 'general' || rawConversationId === NEW_CONVERSATION_ID || rawConversationId.startsWith('message:')) return rawConversationId;
      if (/^\d+$/.test(rawConversationId)) return `message:${rawConversationId}`;
      return null;
    })(),
    companyId: globalThis.sessionStorage?.getItem(sessionCompanyKey) || companyId,
  });

  const [state, dispatch] = useReducer(messagingWidgetReducer, bootState);
  const [messagesByCompany, setMessagesByCompany] = useState({});
  const [presence, setPresence] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [userDirectory, setUserDirectory] = useState({});
  const [recipientSearch, setRecipientSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all');
  const [conversationPanelOpen, setConversationPanelOpen] = useState(true);
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);
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
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const composerRef = useRef(null);

  const draftStorageKey = useMemo(() => {
    const convKey = state.activeConversationId || 'new';
    return `messaging-widget:draft:${normalizeId(sessionId) || 'anonymous'}:${normalizeId(state.activeCompanyId || companyId) || 'none'}:${convKey}`;
  }, [sessionId, state.activeConversationId, state.activeCompanyId, companyId]);

  const cacheKey = getCompanyCacheKey(state.activeCompanyId || companyId);
  const messages = messagesByCompany[cacheKey] || [];

  const fetchThreadMessages = async (rootMessageId, activeCompany) => {
    if (!rootMessageId || !activeCompany) return;
    try {
      const params = new URLSearchParams({ companyId: String(activeCompany) });
      const threadRes = await fetch(`${API_BASE}/messaging/messages/${rootMessageId}/thread?${params.toString()}`, { credentials: 'include' });
      if (!threadRes.ok) return;
      const threadData = await threadRes.json();
      const threadItems = Array.isArray(threadData?.items)
        ? threadData.items
        : [threadData?.root, ...(Array.isArray(threadData?.replies) ? threadData.replies : [])].filter(Boolean);
      if (threadItems.length === 0) return;
      setMessagesByCompany((prev) => {
        const key = getCompanyCacheKey(activeCompany);
        const byId = new Map((prev[key] || []).map((entry) => [String(entry.id), entry]));
        threadItems.forEach((entry) => byId.set(String(entry.id), entry));
        const merged = Array.from(byId.values()).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        return { ...prev, [key]: merged };
      });
    } catch {
      // Keep widget usable when thread fetch fails.
    }
  };

  useEffect(() => {
    globalThis.sessionStorage?.setItem(sessionOpenKey, state.isOpen ? '1' : '0');
  }, [state.isOpen, sessionOpenKey]);

  useEffect(() => {
    if (!state.activeConversationId || state.activeConversationId === NEW_CONVERSATION_ID) {
      globalThis.sessionStorage?.removeItem(sessionConversationKey);
      return;
    }
    globalThis.sessionStorage?.setItem(sessionConversationKey, String(state.activeConversationId));
  }, [state.activeConversationId, sessionConversationKey]);

  useEffect(() => {
    const nextCompany = companyId || state.activeCompanyId;
    if (nextCompany) globalThis.sessionStorage?.setItem(sessionCompanyKey, String(nextCompany));
  }, [companyId, state.activeCompanyId, sessionCompanyKey]);

  useEffect(() => {
    if (!companyId || state.activeCompanyId === companyId) return;
    dispatch({ type: 'company/switch', payload: companyId });
    setPresence([]);
    setUserDirectory({});
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
    const applyResponsivePanels = () => {
      const narrow = globalThis.innerWidth < 1180;
      setIsNarrowLayout(narrow);
      if (narrow) {
        setPresencePanelOpen(false);
        setConversationPanelOpen(false);
      }
    };
    applyResponsivePanels();
    globalThis.addEventListener('resize', applyResponsivePanels);
    return () => globalThis.removeEventListener('resize', applyResponsivePanels);
  }, []);

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
        setNetworkState('ready');
      } catch (err) {
        if (disposed) return;
        setNetworkState('error');
        setError(err.message || 'Messaging unavailable');
      }
    };

    const loadEmployees = async () => {
      try {
        const displayFieldConfigRes = await fetch('/api/display_fields?table=tbl_employee', { credentials: 'include' });
        const displayFieldConfig = displayFieldConfigRes.ok ? await displayFieldConfigRes.json().catch(() => ({})) : {};
        const employeeDisplayFields = Array.isArray(displayFieldConfig?.displayFields)
          ? displayFieldConfig.displayFields.filter((field) => typeof field === 'string' && field.trim())
          : [];

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
          {
            displayName:
              resolveDisplayLabelFromConfig(row, employeeDisplayFields)
              || row.displayName
              || row.emp_name
              || row.employee_name
              || row.emp_fname
              || row.name
              || row.full_name
              || row.username
              || row.emp_id,
            employeeCode: row.employee_code || row.emp_code || row.emp_id,
          },
        ]));

        const missingEmpids = idsFromEmployment.filter((empid) => !sanitizeMessageText(profileMap.get(empid)?.displayName || ''));
        if (missingEmpids.length > 0) {
          try {
            const usersParams = new URLSearchParams({ companyId: String(activeCompany) });
            const usersRes = await fetch(`${API_BASE}/users?${usersParams.toString()}`, { credentials: 'include' });
            if (usersRes.ok) {
              const usersData = await usersRes.json();
              const usersRows = Array.isArray(usersData?.items) ? usersData.items : Array.isArray(usersData) ? usersData : [];
              if (!disposed) {
                setUserDirectory(() => usersRows.reduce((acc, userRow) => {
                  const empid = normalizeId(userRow.empid || userRow.emp_id || userRow.employee_id || userRow.id);
                  if (!empid) return acc;
                  acc[empid] = {
                    displayName: sanitizeMessageText(userRow.full_name || userRow.display_name || userRow.name || userRow.username || empid) || empid,
                    employeeCode: sanitizeMessageText(userRow.username || userRow.empid || userRow.employee_code || empid) || empid,
                  };
                  return acc;
                }, {}));
              }
              usersRows.forEach((userRow) => {
                const empid = normalizeId(userRow.empid || userRow.emp_id || userRow.employee_id || userRow.id);
                if (!empid || !missingEmpids.includes(empid)) return;
                const fallbackDisplayName = sanitizeMessageText(userRow.full_name || userRow.display_name || userRow.name || userRow.username || empid) || empid;
                const current = profileMap.get(empid) || {};
                profileMap.set(empid, {
                  displayName: sanitizeMessageText(current.displayName || fallbackDisplayName) || empid,
                  employeeCode: sanitizeMessageText(current.employeeCode || userRow.username || userRow.empid || empid) || empid,
                });
              });
            }
          } catch {
            // Best effort only; leave existing values.
          }
        }

        const uniqueEmployees = Array.from(new Map(idsFromEmployment.map((empid) => {
          const profile = profileMap.get(empid) || {};
          return [empid, {
            empid,
            name: sanitizeMessageText(profile.displayName || empid) || empid,
            displayName: sanitizeMessageText(profile.displayName || empid) || empid,
            employeeCode: sanitizeMessageText(profile.employeeCode || empid) || empid,
          }];
        })).values());
        setEmployees(uniqueEmployees);

        const presenceParams = new URLSearchParams({
          companyId: String(activeCompany),
          userIds: uniqueEmployees.map((entry) => entry.empid).join(','),
        });
        const presenceRes = await fetch(`${API_BASE}/messaging/presence?${presenceParams.toString()}`, { credentials: 'include' });
        if (presenceRes.ok) {
          const presenceData = await presenceRes.json();
          const onlineUsers = Array.isArray(presenceData?.users) ? presenceData.users : [];
          setPresence(mergePresenceEntries(onlineUsers));
        }
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
    const activeCompany = state.activeCompanyId || companyId;
    if (!activeCompany || !selfEmpid) return undefined;

    const sendHeartbeat = async () => {
      try {
        const heartbeatRes = await fetch(`${API_BASE}/messaging/presence/heartbeat`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: activeCompany, status: PRESENCE.ONLINE }),
        });
        if (heartbeatRes.ok) {
          setPresence((prev) => mergePresenceEntries([
            ...(prev || []).filter((entry) => normalizeId(entry.empid || entry.id) !== selfEmpid),
            { empid: selfEmpid, status: PRESENCE.ONLINE, heartbeat_at: new Date().toISOString() },
          ]));
        }
      } catch {
        // Best-effort only.
      }
    };

    sendHeartbeat();
    const intervalId = globalThis.setInterval(sendHeartbeat, 45_000);
    return () => globalThis.clearInterval(intervalId);
  }, [companyId, selfEmpid, state.activeCompanyId]);


  useEffect(() => {
    const activeCompany = state.activeCompanyId || companyId;
    const employeeIds = Array.from(new Set((employees || []).map((entry) => normalizeId(entry.empid)).filter(Boolean)));
    if (!activeCompany || employeeIds.length === 0) return undefined;

    let disposed = false;
    const refreshPresence = async () => {
      try {
        const presenceParams = new URLSearchParams({
          companyId: String(activeCompany),
          userIds: employeeIds.join(','),
        });
        const presenceRes = await fetch(`${API_BASE}/messaging/presence?${presenceParams.toString()}`, { credentials: 'include' });
        if (!presenceRes.ok || disposed) return;
        const presenceData = await presenceRes.json();
        if (disposed) return;
        const onlineUsers = Array.isArray(presenceData?.users) ? presenceData.users : [];
        setPresence(mergePresenceEntries(onlineUsers));
      } catch {
        // Polling is best effort only.
      }
    };

    refreshPresence();
    const intervalId = globalThis.setInterval(refreshPresence, 60_000);
    return () => {
      disposed = true;
      globalThis.clearInterval(intervalId);
    };
  }, [companyId, employees, state.activeCompanyId]);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (payload) => {
      const nextMessage = payload?.message || payload;
      if (normalizeId(nextMessage?.company_id || nextMessage?.companyId) !== (state.activeCompanyId || companyId)) return;
      setMessagesByCompany((prev) => {
        const key = getCompanyCacheKey(state.activeCompanyId || companyId);
        return { ...prev, [key]: mergeMessageList(prev[key], nextMessage) };
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
      const payloadCompanyId = normalizeId(payload?.companyId || payload?.company_id);
      const activeCompanyId = normalizeId(state.activeCompanyId || companyId);
      if (payloadCompanyId && activeCompanyId && payloadCompanyId !== activeCompanyId) return;

      if (Array.isArray(payload?.onlineUsers)) {
        setPresence(mergePresenceEntries(payload.onlineUsers));
        return;
      }

      const incoming = Array.isArray(payload?.onlineUsers)
        ? payload.onlineUsers
        : payload?.empid
          ? [payload]
          : [];
      if (incoming.length === 0) return;
      setPresence((prev) => {
        const next = new Map((prev || []).map((entry) => [normalizeId(entry.empid || entry.id), entry]));
        incoming.forEach((entry) => {
          const empid = normalizeId(entry.empid || entry.id);
          if (!empid) return;
          const status = resolvePresence(entry);
          if (status === PRESENCE.OFFLINE) {
            next.set(empid, { ...next.get(empid), ...entry, empid, status: PRESENCE.OFFLINE, last_seen_at: entry?.last_seen_at || new Date().toISOString() });
            return;
          }
          next.set(empid, { ...next.get(empid), ...entry, empid, status });
        });
        return Array.from(next.values());
      });
    };
    const onDeleted = (payload) => {
      const messageId = Number(payload?.messageId || payload?.id);
      if (!messageId) return;
      setMessagesByCompany((prev) => {
        const key = getCompanyCacheKey(state.activeCompanyId || companyId);
        const nextMessages = (prev[key] || []).filter((entry) => Number(entry.id) !== messageId && Number(entry.parent_message_id || entry.parentMessageId) !== messageId);
        return { ...prev, [key]: nextMessages };
      });
    };
    socket.on('messages:new', onNew);
    socket.on('message.created', onNew);
    socket.on('thread.reply.created', onNew);
    socket.on('messages:presence', onPresence);
    socket.on('presence.changed', onPresence);
    socket.on('message.deleted', onDeleted);
    return () => {
      socket.off('messages:new', onNew);
      socket.off('message.created', onNew);
      socket.off('thread.reply.created', onNew);
      socket.off('messages:presence', onPresence);
      socket.off('presence.changed', onPresence);
      socket.off('message.deleted', onDeleted);
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
  const isDraftConversation = state.activeConversationId === NEW_CONVERSATION_ID;
  const requestedConversation = isDraftConversation
    ? null
    : conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
  const activeConversation = isDraftConversation ? null : (requestedConversation || conversations[0] || null);
  const activeConversationId = isDraftConversation ? NEW_CONVERSATION_ID : (activeConversation?.id || null);
  const threadMessages = useMemo(() => buildNestedThreads(activeConversation?.messages || []), [activeConversation]);
  const messageMap = useMemo(() => new Map(messages.map((msg) => [msg.id, msg])), [messages]);
  const unreadCount = messages.filter((msg) => !msg.read_by?.includes?.(selfEmpid)).length;

  useEffect(() => {
    if (!activeConversation?.rootMessageId) return;
    const rootExists = messages.some((entry) => Number(entry.id) === Number(activeConversation.rootMessageId));
    if (!rootExists) dispatch({ type: 'widget/setConversation', payload: null });
  }, [activeConversation?.rootMessageId, messages]);


  useEffect(() => {
    if (state.composer.attachments.length > 0) setAttachmentsOpen(true);
  }, [state.composer.attachments.length]);

  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = 'auto';
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 240)}px`;
  }, [state.composer.body]);

  const presenceMap = useMemo(
    () => new Map(presence.map((entry) => [normalizeId(entry.empid || entry.id), resolvePresence(entry)])),
    [presence],
  );

  const employeeRecords = useMemo(() => {
    const seen = new Map();
    const participantIds = new Set(state.composer.recipients);
    messages.forEach((msg) => {
      collectMessageParticipantEmpids(msg).forEach((empid) => participantIds.add(empid));
    });

    employees.forEach((entry) => {
      seen.set(entry.empid, {
        id: entry.empid,
        label: sanitizeMessageText(entry.displayName || entry.name || entry.empid) || entry.empid,
        employeeCode: sanitizeMessageText(entry.employeeCode || entry.empid) || entry.empid,
        status: presenceMap.get(entry.empid) || PRESENCE.OFFLINE,
      });
    });
    presence.forEach((entry) => {
      const empid = normalizeId(entry.empid || entry.id);
      if (!empid) return;
      const existing = seen.get(empid) || { id: empid };
      seen.set(empid, {
        ...existing,
        id: empid,
        label: sanitizeMessageText(existing.label || entry.displayName || entry.name || empid) || empid,
        employeeCode: sanitizeMessageText(existing.employeeCode || entry.employeeCode || empid) || empid,
        status: resolvePresence(entry),
      });
    });
    messages.forEach((msg) => {
      const empid = normalizeId(msg.author_empid);
      if (!empid || seen.has(empid)) return;
      const userProfile = userDirectory[empid] || {};
      seen.set(empid, {
        id: empid,
        label: sanitizeMessageText(msg.author_name || msg.author_display_name || msg.author_username || userProfile.displayName || empid) || empid,
        employeeCode: sanitizeMessageText(userProfile.employeeCode || empid) || empid,
        status: presenceMap.get(empid) || PRESENCE.OFFLINE,
      });
    });

    participantIds.forEach((empid) => {
      if (!empid || seen.has(empid)) return;
      const userProfile = userDirectory[empid] || {};
      seen.set(empid, {
        id: empid,
        label: sanitizeMessageText(userProfile.displayName || empid) || empid,
        employeeCode: sanitizeMessageText(userProfile.employeeCode || empid) || empid,
        status: presenceMap.get(empid) || PRESENCE.OFFLINE,
      });
    });

    return Array.from(seen.values())
      .filter((entry) => entry.id !== selfEmpid)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees, messages, presence, presenceMap, selfEmpid, state.composer.recipients, userDirectory]);

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
    const previewDecoded = decodeMessageContent(previewMessage?.body || '');
    return {
      ...conversation,
      unread: conversation.messages.filter((msg) => !msg.read_by?.includes?.(selfEmpid)).length,
      preview: sanitizeMessageText(previewDecoded.text || '').slice(0, 48) || (conversation.isGeneral ? 'Company-wide channel' : 'No messages yet'),
      groupName: conversation.isGeneral
        ? 'Company-wide'
        : conversation.linkedType && conversation.linkedId
          ? `${conversation.linkedType} #${conversation.linkedId}`
          : `Thread #${conversation.rootMessageId}`,
      lastActivity: previewMessage?.created_at || null,
    };
  }), [conversations, selfEmpid]);

  const activeTopic = state.composer.topic || activeConversation?.title || 'Untitled topic';
  const sessionUserLabel = sanitizeMessageText(
    user?.emp_name || user?.employee_name || user?.name || user?.full_name || user?.username || user?.empid,
  );
  const employeeLabelMap = useMemo(() => {
    const labels = new Map(employeeRecords.map((entry) => [entry.id, entry.label]));
    if (selfEmpid && sessionUserLabel) labels.set(selfEmpid, sessionUserLabel);
    return labels;
  }, [employeeRecords, selfEmpid, sessionUserLabel]);
  const resolveEmployeeLabel = (empid) => {
    const normalizedEmpid = normalizeId(empid);
    if (!normalizedEmpid) return 'Unknown user';
    return employeeLabelMap.get(normalizedEmpid) || normalizedEmpid;
  };

  const activeConversationParticipants = useMemo(() => {
    const ids = new Set();
    (activeConversation?.messages || []).forEach((msg) => {
      collectMessageParticipantEmpids(msg).forEach((empid) => ids.add(empid));
    });
    return Array.from(ids);
  }, [activeConversation]);

  const activeConversationParticipantLabels = useMemo(
    () => activeConversationParticipants.map((empid) => resolveEmployeeLabel(empid)),
    [activeConversationParticipants],
  );

  const activeRootMessage = useMemo(
    () => messages.find((entry) => Number(entry.id) === Number(activeConversation?.rootMessageId)) || null,
    [messages, activeConversation?.rootMessageId],
  );

  const isReplyMode = Boolean(state.composer.replyToId);
  const canEditTopic = !activeConversation?.isGeneral && !isReplyMode && (!activeRootMessage || normalizeId(activeRootMessage.author_empid) === selfEmpid);


  const safeTopic = sanitizeMessageText(state.composer.topic || activeConversation?.title || '');
  const safeBody = sanitizeMessageText(state.composer.body);
  const canSendMessage = Boolean(safeBody && (canEditTopic ? safeTopic : true));

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

  const canDeleteMessage = (message) => {
    if (!message) return false;
    return normalizeId(message.author_empid) === selfEmpid;
  };

  const handleDeleteMessage = async (messageId) => {
    const activeCompany = state.activeCompanyId || companyId;
    const params = new URLSearchParams({ companyId: String(activeCompany) });
    const res = await fetch(`${API_BASE}/messaging/messages/${messageId}?${params.toString()}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: activeCompany }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setComposerAnnouncement(payload?.error?.message || payload?.message || 'Unable to delete message.');
      return;
    }
    setMessagesByCompany((prev) => {
      const key = getCompanyCacheKey(activeCompany);
      const nextMessages = (prev[key] || []).filter((entry) => Number(entry.id) !== Number(messageId) && Number(entry.parent_message_id || entry.parentMessageId) !== Number(messageId));
      return { ...prev, [key]: nextMessages };
    });
    if (Number(activeConversation?.rootMessageId) === Number(messageId)) {
      dispatch({ type: 'widget/setConversation', payload: null });
    }
    setComposerAnnouncement('Conversation deleted.');
  };


  const uploadComposerAttachments = async (activeCompany) => {
    const files = state.composer.attachments || [];
    if (!files.length) return [];
    const form = new FormData();
    form.append('companyId', String(activeCompany));
    files.forEach((file) => form.append('files', file));
    const uploadRes = await fetch(`${API_BASE}/messaging/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.json().catch(() => null);
      throw new Error(uploadErr?.message || 'Failed to upload attachments');
    }
    const uploadPayload = await uploadRes.json().catch(() => ({}));
    return Array.isArray(uploadPayload?.items) ? uploadPayload.items : [];
  };

  const handleDeleteConversationFromList = async (conversation) => {
    if (!conversation?.rootMessageId) return;
    const rootMessage = messages.find((entry) => Number(entry.id) === Number(conversation.rootMessageId));
    if (!canDeleteMessage(rootMessage)) {
      setComposerAnnouncement('You do not have permission to delete this thread.');
      return;
    }
    await handleDeleteMessage(conversation.rootMessageId);
  };

  const sendMessage = async () => {
    if (canEditTopic && !safeTopic) {
      setComposerAnnouncement('Topic is required.');
      return;
    }
    if (!safeBody) {
      setComposerAnnouncement('Cannot send an empty message.');
      return;
    }
    const linkedType = state.composer.linkedType || activeConversation?.linkedType || null;
    const linkedId = state.composer.linkedId || activeConversation?.linkedId || null;
    if ((linkedType && !linkedId) || (!linkedType && linkedId)) {
      setComposerAnnouncement('Conversation context is incomplete. Provide both linked type and linked id.');
      return;
    }

    const activeCompany = state.activeCompanyId || companyId;
    const clientTempId = `tmp-${createIdempotencyKey()}`;
    let uploadedAttachments = [];
    try {
      uploadedAttachments = await uploadComposerAttachments(activeCompany);
    } catch (err) {
      setComposerAnnouncement(err.message || 'Attachment upload failed.');
      return;
    }

    const payloadRecipients = Array.from(new Set((state.composer.recipients || []).map(normalizeId).filter(Boolean)));
    const threadParticipants = Array.from(new Set(activeConversationParticipants.filter((empid) => empid !== selfEmpid)));
    const replyRecipients = state.composer.replyToId
      ? Array.from(new Set([...threadParticipants, ...payloadRecipients]))
      : payloadRecipients;
    const finalRecipients = state.composer.replyToId ? replyRecipients : payloadRecipients;
    const visibilityScope = finalRecipients.length > 0 ? 'private' : 'company';

    const payload = {
      idempotencyKey: createIdempotencyKey(),
      clientTempId,
      body: `${canEditTopic ? `[${safeTopic}] ` : ''}${safeBody}${encodeAttachmentPayload(uploadedAttachments)}`,
      companyId: Number.isFinite(Number(activeCompany)) ? Number(activeCompany) : String(activeCompany),
      recipientEmpids: finalRecipients,
      visibilityScope,
      visibilityEmpid: finalRecipients[0] || null,
      ...(linkedType ? { linkedType } : {}),
      ...(linkedId ? { linkedId: String(linkedId) } : {}),
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
      const successPayload = await res.json().catch(() => null);
      const createdMessage = successPayload?.message || null;
      if (createdMessage) {
        setMessagesByCompany((prev) => {
          const key = getCompanyCacheKey(state.activeCompanyId || companyId);
          return { ...prev, [key]: mergeMessageList(prev[key], createdMessage) };
        });
        const threadRootId = createdMessage.conversation_id || createdMessage.conversationId || createdMessage.parent_message_id || createdMessage.parentMessageId || createdMessage.id;
        dispatch({ type: 'widget/setConversation', payload: threadRootId ? `message:${threadRootId}` : null });
        await fetchThreadMessages(threadRootId, activeCompany);
      }
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


  const onPreviewAttachment = (file) => {
    if (!isImageAttachment(file)) return;
    setAttachmentPreview(file);
    setAttachmentPreviewOpen(true);
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
    dispatch({ type: 'widget/setConversation', payload: null });
    dispatch({ type: 'composer/setTopic', payload: '' });
    dispatch({ type: 'composer/setBody', payload: '' });
    dispatch({ type: 'composer/setReplyTo', payload: null });
    setComposerAnnouncement('Started a new message draft.');
  };

  const onComposerInput = (event) => {
    const value = event.target.value;
    dispatch({ type: 'composer/setBody', payload: value });
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 240)}px`;
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
    const mentionLabel = resolveEmployeeLabel(empid).replace(/\s+/g, '_');
    const nextBody = `${body.slice(0, mentionStart)}@${mentionLabel} ${body.slice(cursor)}`;
    dispatch({ type: 'composer/setBody', payload: nextBody });
    setMentionOpen(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      const nextPos = mentionStart + mentionLabel.length + 2;
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextPos, nextPos);
    });
  };

  const onRemoveRecipient = (id) => {
    dispatch({ type: 'composer/setRecipients', payload: state.composer.recipients.filter((entry) => entry !== id) });
  };

  useEffect(() => {
    const activeCompany = state.activeCompanyId || companyId;
    if (!activeCompany || !activeConversation?.rootMessageId) return;
    fetchThreadMessages(activeConversation.rootMessageId, activeCompany);
  }, [activeConversation?.rootMessageId, state.activeCompanyId, companyId]);

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
        width: isNarrowLayout ? '96vw' : 940,
        maxWidth: '98vw',
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: 14,
        zIndex: 1200,
        overflow: 'hidden',
        height: '58vh',
        maxHeight: '58vh',
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

      <div style={{ display: 'grid', gridTemplateColumns: isNarrowLayout ? 'minmax(0, 1fr)' : '300px minmax(0,1fr)', minHeight: 0, height: '100%' }}>
        <aside style={{ borderRight: isNarrowLayout ? 'none' : '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <label htmlFor="messaging-company-switch" style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Company</label>
            <input
              id="messaging-company-switch"
              value={state.activeCompanyId || ''}
              onChange={onSwitchCompany}
              aria-label="Switch company context"
              style={{ width: '100%', marginTop: 6, borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px' }}
            />
          </div>

          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Threads</h3>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>One row per conversation.</p>
            </div>
            <button type="button" onClick={() => setConversationPanelOpen((prev) => !prev)} style={{ border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', padding: '4px 8px', fontSize: 12 }}>
              {conversationPanelOpen ? 'Hide' : 'Show'}
            </button>
          </div>

          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
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

          {conversationPanelOpen && (
          <div style={{ overflowY: 'auto', padding: 8, display: 'grid', gap: 6, minHeight: 0, flex: 1, alignContent: 'start', gridAutoRows: 'max-content' }}>
            {conversationSummaries.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No conversations yet.</p>}
            {conversationSummaries.map((conversation) => (
              <div key={conversation.id} style={{ borderRadius: 12, border: conversation.id === activeConversationId ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: conversation.id === activeConversationId ? '#eff6ff' : '#ffffff', padding: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'widget/setConversation', payload: conversation.id });
                    dispatch({ type: 'composer/setTopic', payload: conversation.title });
                    if (conversation.linkedType && conversation.linkedId) {
                      dispatch({ type: 'composer/setLinkedContext', payload: { linkedType: conversation.linkedType, linkedId: conversation.linkedId } });
                    }
                  }}
                  style={{ textAlign: 'left', border: 0, background: 'transparent', width: '100%', padding: 0 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a', fontSize: 13 }}>{conversation.title}</strong>
                    {conversation.unread > 0 && (
                      <span style={{ minWidth: 20, textAlign: 'center', borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 11, padding: '1px 6px' }}>
                        {conversation.unread}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '3px 0', fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conversation.preview}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: '#64748b' }}>
                    {conversation.groupName} · {formatLastActivity(conversation.lastActivity)}
                  </p>
                </button>
                {!conversation.isGeneral && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      aria-label={`Delete conversation ${conversation.title}`}
                      onClick={() => handleDeleteConversationFromList(conversation)}
                      disabled={!canDeleteMessage(messages.find((entry) => Number(entry.id) === Number(conversation.rootMessageId)))}
                      style={{ border: 0, background: 'transparent', color: '#b91c1c', fontSize: 12, cursor: 'pointer' }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </aside>

        <section style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minWidth: 0, minHeight: 0 }}>
          <main style={{ padding: '10px 14px 8px', overflowY: 'auto', minHeight: 420 }} aria-live="polite">
            <div style={{ position: 'sticky', top: 0, background: '#f8fafc', paddingBottom: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 16, color: '#0f172a' }}>{activeTopic}</strong>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Ctrl/Cmd + Enter sends your message.</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#334155' }}>Participants: {activeConversationParticipantLabels.length ? activeConversationParticipantLabels.join(', ') : 'Everyone in company'}</p>
              {activeConversation?.rootMessageId && canDeleteMessage(messages.find((entry) => Number(entry.id) === Number(activeConversation.rootMessageId))) && (
                <button type="button" onClick={() => handleDeleteMessage(activeConversation.rootMessageId)} style={{ marginTop: 6 }}>
                  Delete thread
                </button>
              )}
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
                resolveEmployeeLabel={resolveEmployeeLabel}
                canDeleteMessage={canDeleteMessage}
                onDeleteMessage={handleDeleteMessage}
                onPreviewAttachment={onPreviewAttachment}
              />
            ))}
          </main>

          <form
            style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff', padding: 10, position: 'sticky', bottom: 0, maxHeight: '34vh', overflowY: 'auto' }}
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
            <div style={{ display: 'grid', gridTemplateColumns: canEditTopic ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8 }}>
              {canEditTopic && (
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
              )}

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
                const label = found?.label || resolveEmployeeLabel(empid);
                const status = found?.status || presenceMap.get(empid) || PRESENCE.OFFLINE;
                return (
                  <span key={empid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1', borderRadius: 999, padding: '4px 10px', background: '#f8fafc' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {initialsForLabel(label)}
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: presenceColor(status) }} />
                    <span style={{ fontSize: 12, color: '#1e293b' }}>{label}</span>
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
              rows={3}
              placeholder="Type a message…"
              aria-label="Message composer"
              style={{
                width: '100%',
                marginTop: 6,
                borderRadius: 12,
                border: dragOverComposer ? '2px dashed #f97316' : '2px dashed #cbd5e1',
                padding: '10px 12px',
                fontSize: 15,
                minHeight: 72,
                maxHeight: 240,
                overflowY: 'auto',
                resize: 'none',
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

            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setAttachmentsOpen((prev) => !prev)}
                style={{ border: 0, background: 'transparent', padding: 0, fontSize: 12, fontWeight: 600, color: '#334155' }}
              >
                {attachmentsOpen ? '▾' : '▸'} Context & attachments {state.composer.attachments.length > 0 ? `(${state.composer.attachments.length})` : ''}
              </button>
              {attachmentsOpen && (
                <>
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

            {attachmentPreviewOpen && attachmentPreview && (
              <div
                role="dialog"
                aria-modal="true"
                onClick={() => setAttachmentPreviewOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}
              >
                <div onClick={(event) => event.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 12, maxWidth: 'min(90vw, 980px)', maxHeight: '90vh', overflow: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>{attachmentPreview.name || 'Image preview'}</strong>
                    <button type="button" onClick={() => setAttachmentPreviewOpen(false)}>Close</button>
                  </div>
                  <img src={attachmentPreview.url} alt={attachmentPreview.name || 'attachment preview'} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} />
                  <div style={{ marginTop: 8 }}>
                    <a href={`${attachmentPreview.url}${attachmentPreview.url.includes('?') ? '&' : '?'}download=1`} download={attachmentPreview.name || 'attachment'}>Download image</a>
                  </div>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>
    </section>
  );
}
