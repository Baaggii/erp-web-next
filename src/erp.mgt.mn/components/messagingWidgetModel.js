export const PRESENCE = {
  ONLINE: 'online',
  AWAY: 'away',
  OFFLINE: 'offline',
};

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
      replyToId: null,
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
      return { ...state, activeConversationId: action.payload || null, composer: { ...state.composer, replyToId: null } };
    case 'composer/setBody':
      return { ...state, composer: { ...state.composer, body: action.payload } };
    case 'composer/setReplyTo':
      return { ...state, composer: { ...state.composer, replyToId: action.payload || null } };
    case 'composer/setAttachments':
      return { ...state, composer: { ...state.composer, attachments: action.payload || [] } };
    case 'composer/reset':
      return { ...state, composer: { body: '', replyToId: null, attachments: [] } };
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
