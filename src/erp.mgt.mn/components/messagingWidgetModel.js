export const PRESENCE = {
  ONLINE: 'online',
  AWAY: 'away',
  OFFLINE: 'offline',
};

const ONLINE_STALE_AFTER_MS = 90_000;
const OFFLINE_STALE_AFTER_MS = 150_000;

function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function resolvePresenceStatus(record, now = Date.now()) {
  const rawStatus = String(record?.presence || record?.status || '').toLowerCase();
  const heartbeatAt = toTimestamp(
    record?.heartbeat_at
    || record?.heartbeatAt
    || record?.last_active_at
    || record?.lastActiveAt,
  );
  const lastSeenAt = toTimestamp(record?.last_seen_at || record?.lastSeenAt);
  const activityAt = heartbeatAt ?? lastSeenAt;

  if (rawStatus === PRESENCE.OFFLINE) return PRESENCE.OFFLINE;

  if (activityAt != null) {
    const age = Math.max(0, now - activityAt);
    if (age > OFFLINE_STALE_AFTER_MS) return PRESENCE.OFFLINE;
    if (age > ONLINE_STALE_AFTER_MS) return PRESENCE.AWAY;
  }

  if (rawStatus === PRESENCE.ONLINE || rawStatus === PRESENCE.AWAY) return rawStatus;
  if (lastSeenAt != null) return PRESENCE.OFFLINE;
  return activityAt != null ? PRESENCE.AWAY : PRESENCE.OFFLINE;
}

export function normalizeId(value) {
  return String(value ?? '').trim();
}

export function buildSessionStorageKey(sessionId, suffix) {
  return `messaging-widget:${normalizeId(sessionId) || 'anonymous'}:${suffix}`;
}

export function sanitizeMessageText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function safePreviewableFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf' || type.startsWith('text/');
}

export function getCompanyCacheKey(companyId) {
  return `company:${normalizeId(companyId) || 'none'}`;
}

export function createInitialWidgetState({ isOpen = false, activeConversationId = null, companyId = null } = {}) {
  return {
    isOpen,
    activeConversationId,
    activeCompanyId: companyId,
    composer: {
      body: '',
      topic: '',
      recipients: [],
      replyToId: null,
      linkedType: null,
      linkedId: null,
      attachments: [],
    },
  };
}

export function messagingWidgetReducer(state, action) {
  switch (action.type) {
    case 'widget/toggle':
      return { ...state, isOpen: !state.isOpen };
    case 'widget/open':
      return { ...state, isOpen: true };
    case 'widget/close':
      return { ...state, isOpen: false };
    case 'widget/setConversation':
      return {
        ...state,
        activeConversationId: action.payload == null ? null : String(action.payload),
        composer: { ...state.composer, replyToId: null },
      };
    case 'composer/setBody':
      return { ...state, composer: { ...state.composer, body: action.payload } };
    case 'composer/setTopic':
      return { ...state, composer: { ...state.composer, topic: sanitizeMessageText(action.payload).slice(0, 120) } };
    case 'composer/setRecipients':
      return {
        ...state,
        composer: {
          ...state.composer,
          recipients: Array.isArray(action.payload)
            ? Array.from(new Set(action.payload.map(normalizeId).filter(Boolean)))
            : [],
        },
      };
    case 'composer/setReplyTo':
      return { ...state, composer: { ...state.composer, replyToId: action.payload || null } };
    case 'composer/setLinkedContext':
      return {
        ...state,
        composer: {
          ...state.composer,
          linkedType: action.payload?.linkedType || null,
          linkedId: action.payload?.linkedId || null,
        },
      };
    case 'composer/setAttachments':
      return { ...state, composer: { ...state.composer, attachments: action.payload || [] } };
    case 'composer/start':
      return {
        ...state,
        isOpen: true,
        activeConversationId: action.payload?.conversationId || null,
        composer: {
          body: '',
          topic: sanitizeMessageText(action.payload?.topic || '').slice(0, 120),
          recipients: Array.isArray(action.payload?.recipients)
            ? Array.from(new Set(action.payload.recipients.map(normalizeId).filter(Boolean)))
            : [],
          replyToId: null,
          linkedType: action.payload?.linkedType || null,
          linkedId: action.payload?.linkedId || null,
          attachments: [],
        },
      };
    case 'composer/reset':
      return {
        ...state,
        composer: {
          body: '',
          topic: state.composer.topic,
          recipients: state.composer.recipients,
          replyToId: null,
          linkedType: state.composer.linkedType,
          linkedId: state.composer.linkedId,
          attachments: [],
        },
      };
    case 'company/switch':
      return {
        ...createInitialWidgetState({
          isOpen: state.isOpen,
          activeConversationId: null,
          companyId: action.payload || null,
        }),
      };
    default:
      return state;
  }
}
