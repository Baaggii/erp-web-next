import { normalizeConversationId, normalizeId, sanitizeMessageText } from './messagingWidgetModel.js';

function normalizeParticipantIds(value) {
  const ids = [];
  const pushValue = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach((item) => pushValue(item));
      return;
    }
    if (typeof entry === 'object') {
      ids.push(entry?.empid, entry?.emp_id, entry?.empId, entry?.id, entry?.user_id, entry?.userId);
      return;
    }
    if (typeof entry === 'string') {
      entry.split(',').forEach((item) => ids.push(item));
      return;
    }
    ids.push(entry);
  };

  pushValue(value);
  return Array.from(new Set(ids.map(normalizeId).filter(Boolean)));
}

function deriveConversationTitle(entry, isGeneral = false) {
  if (isGeneral || (entry?.type || '').toLowerCase() === 'general') return 'General';
  return sanitizeMessageText(
    entry?.title
    || entry?.topic
    || entry?.subject
    || entry?.last_message_topic
    || entry?.lastMessageTopic
    || entry?.last_message_body
    || entry?.lastMessageBody
    || entry?.root_message_topic
    || entry?.rootMessageTopic
    || entry?.root_message_body
    || entry?.rootMessageBody
    || (entry?.linked_type && entry?.linked_id ? `${entry.linked_type} #${entry.linked_id}` : '')
    || 'Untitled conversation',
  ).slice(0, 120) || 'Untitled conversation';
}

function toActivityScore(lastMessageAt, lastMessageId) {
  const timestamp = new Date(lastMessageAt || 0).getTime();
  if (Number.isFinite(timestamp) && timestamp > 0) return { kind: 'time', value: timestamp };
  const normalizedId = normalizeId(lastMessageId);
  if (/^\d+$/.test(normalizedId)) return { kind: 'id', value: Number(normalizedId) };
  return { kind: 'none', value: 0 };
}

export function adaptConversationListResponse(data) {
  const items = Array.isArray(data?.items) ? data.items : [];

  return {
    items: items
      .map((entry) => {
        const type = String(entry?.type || 'private').toLowerCase();
        const visibilityScope = String(entry?.visibility_scope ?? entry?.visibilityScope ?? '').toLowerCase();
        const isGeneral = type === 'general'
          || (entry?.is_general ?? entry?.isGeneral) === true
          || (visibilityScope === 'company' && !(entry?.linked_type ?? entry?.linkedType) && !(entry?.linked_id ?? entry?.linkedId));
        const conversationId = normalizeConversationId(entry?.id ?? entry?.conversation_id ?? entry?.conversationId);
        if (conversationId == null) return null;
        const normalizedId = normalizeId(conversationId);
        const participants = normalizeParticipantIds(
          entry?.participants
          ?? entry?.participant_empids
          ?? entry?.participantEmpids
          ?? entry?.participant_ids
          ?? entry?.participantIds
          ?? entry?.recipient_empids
          ?? entry?.recipientEmpids
          ?? entry?.recipient_ids
          ?? entry?.recipientIds,
        );
        return {
          id: `conversation:${normalizedId}`,
          conversationId,
          topic: sanitizeMessageText(entry?.topic || '').slice(0, 120) || deriveConversationTitle(entry, isGeneral),
          title: sanitizeMessageText(entry?.topic || '').slice(0, 120) || deriveConversationTitle(entry, isGeneral),
          type,
          linkedType: entry?.linked_type ?? entry?.linkedType ?? null,
          linkedId: normalizeId(entry?.linked_id ?? entry?.linkedId) || null,
          isGeneral,
          participants,
          lastMessageAt: entry?.last_message_at ?? entry?.lastMessageAt ?? null,
          lastMessageId: normalizeId(entry?.last_message_id ?? entry?.lastMessageId) || null,
          visibilityScope: visibilityScope || null,
          unread: 0,
          createdByEmpid: normalizeId(entry?.created_by_empid ?? entry?.createdByEmpid) || null,
          raw: entry,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aActivity = toActivityScore(a.lastMessageAt, a.lastMessageId);
        const bActivity = toActivityScore(b.lastMessageAt, b.lastMessageId);
        if (aActivity.kind === 'time' || bActivity.kind === 'time') {
          if (aActivity.kind !== bActivity.kind) return aActivity.kind === 'time' ? -1 : 1;
          if (aActivity.value !== bActivity.value) return bActivity.value - aActivity.value;
        } else if (aActivity.kind === 'id' || bActivity.kind === 'id') {
          if (aActivity.kind !== bActivity.kind) return aActivity.kind === 'id' ? -1 : 1;
          if (aActivity.value !== bActivity.value) return bActivity.value - aActivity.value;
        }
        return Number(b.conversationId || 0) - Number(a.conversationId || 0);
      }),
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
