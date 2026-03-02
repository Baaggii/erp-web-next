import { normalizeConversationId, normalizeId, sanitizeMessageText } from './messagingWidgetModel.js';

function deriveConversationTitle(entry) {
  if ((entry?.type || '').toLowerCase() === 'general') return 'General';
  return sanitizeMessageText(
    entry?.title
    || entry?.topic
    || entry?.subject
    || (entry?.linked_type && entry?.linked_id ? `${entry.linked_type} #${entry.linked_id}` : '')
    || 'Untitled conversation',
  ).slice(0, 120) || 'Untitled conversation';
}

export function adaptConversationListResponse(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  let hasGeneralConversation = false;

  return {
    items: items
      .map((entry) => {
        const type = String(entry?.type || 'private').toLowerCase();
        const linkedType = entry?.linked_type ?? entry?.linkedType ?? null;
        const linkedId = normalizeId(entry?.linked_id ?? entry?.linkedId) || null;
        const visibilityScope = String(entry?.visibility_scope ?? entry?.visibilityScope ?? '').toLowerCase();
        const isCompanyWideUnlinked = visibilityScope === 'company' && !linkedType && !linkedId;
        const isGeneral = type === 'general' || (entry?.is_general ?? entry?.isGeneral) === true || isCompanyWideUnlinked;
        const conversationId = normalizeConversationId(entry?.id ?? entry?.conversation_id ?? entry?.conversationId);
        if (!isGeneral && conversationId == null) return null;
        if (isGeneral) hasGeneralConversation = true;
        const normalizedId = normalizeId(conversationId);
        return {
          id: isGeneral ? 'general' : `conversation:${normalizedId}`,
          conversationId: isGeneral ? 'general' : conversationId,
          title: isGeneral ? 'General' : deriveConversationTitle(entry),
          type,
          linkedType,
          linkedId,
          isGeneral,
          participants: Array.isArray(entry?.participants) ? entry.participants : [],
          lastMessageAt: entry?.last_message_at ?? entry?.lastMessageAt ?? null,
          lastMessageId: normalizeId(entry?.last_message_id ?? entry?.lastMessageId) || null,
          unread: 0,
          raw: entry,
        };
      })
      .filter(Boolean)
      .concat(hasGeneralConversation
        ? []
        : [{
          id: 'general',
          conversationId: 'general',
          title: 'General',
          type: 'general',
          linkedType: null,
          linkedId: null,
          isGeneral: true,
          participants: [],
          lastMessageAt: null,
          lastMessageId: null,
          unread: 0,
          raw: null,
        }]),
    pageInfo: data?.pageInfo ?? null,
  };
}

export function adaptThreadResponse(data) {
  const conversationId = normalizeConversationId(data?.conversationId ?? data?.conversation_id);
  const items = Array.isArray(data?.items) ? data.items : [];

  return {
    conversationId,
    items: items
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        ...entry,
        id: normalizeId(entry?.id),
        parent_message_id: normalizeId(entry?.parent_message_id ?? entry?.parentMessageId) || null,
        conversation_id: normalizeConversationId(entry?.conversation_id ?? entry?.conversationId ?? conversationId),
      })),
    pageInfo: data?.pageInfo ?? null,
  };
}
