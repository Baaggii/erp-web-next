import { normalizeId, sanitizeMessageText } from './messagingWidgetModel.js';

export const GENERAL_CONVERSATION_ID = 'general';
export const GENERAL_CONVERSATION_TITLE = 'General';
export const NEW_CONVERSATION_ID = '__new__';
export const GENERAL_VISIBILITY_SCOPE = 'company';

export function collectMessageParticipantEmpids(message) {
  const ids = [];
  ids.push(message?.author_empid, message?.authorEmpid);

  const explicitParticipants = message?.participant_empids || message?.participantEmpids || message?.participants;
  if (Array.isArray(explicitParticipants)) ids.push(...explicitParticipants);
  else if (typeof explicitParticipants === 'string') ids.push(...explicitParticipants.split(','));

  const visibilityEmpids = [message?.visibility_empid, message?.visibilityEmpid]
    .flatMap((value) => String(value || '').split(','));
  ids.push(...visibilityEmpids);

  const recipientEmpids = message?.recipient_empids || message?.recipientEmpids || message?.recipient_ids || message?.recipientIds;
  if (Array.isArray(recipientEmpids)) ids.push(...recipientEmpids);
  else if (typeof recipientEmpids === 'string') ids.push(...recipientEmpids.split(','));

  return Array.from(new Set(ids.map(normalizeId).filter(Boolean)));
}

export function resolveMessageVisibilityScope(message) {
  return String(message?.visibility_scope || message?.visibilityScope || GENERAL_VISIBILITY_SCOPE).toLowerCase();
}

function extractMessageTopic(message) {
  const directTopic = sanitizeMessageText(message?.topic || '').slice(0, 120);
  if (directTopic) return directTopic;
  return '';
}

function extractContextLink(message) {
  const linkedType = message?.linked_type || message?.linkedType || null;
  const linkedId = message?.linked_id || message?.linkedId || null;
  if (linkedType && linkedId) return { linkedType, linkedId };
  if (message?.transaction_id) return { linkedType: 'transaction', linkedId: String(message.transaction_id) };
  return { linkedType: null, linkedId: null };
}

function buildConversationId(message, resolvedRootMessageId) {
  const explicitConversationId = normalizeId(message?.conversation_entity_id || message?.conversationEntityId || message?.conversation_id || message?.conversationId);
  if (explicitConversationId) return explicitConversationId;
  if (resolvedRootMessageId) return `message:${resolvedRootMessageId}`;
  return null;
}

export function canViewerAccessMessage(message, viewerEmpid) {
  if (!message) return false;
  if (resolveMessageVisibilityScope(message) !== 'private') return true;
  const normalizedViewer = normalizeId(viewerEmpid);
  if (!normalizedViewer) return false;
  return collectMessageParticipantEmpids(message).includes(normalizedViewer);
}

export function isConversationVisibleToViewer(conversation, viewerEmpid) {
  if (!conversation) return false;
  if (conversation.visibilityScope !== 'private') return true;
  const normalizedViewer = normalizeId(viewerEmpid);
  if (!normalizedViewer) return false;
  return conversation.participantEmpids.includes(normalizedViewer);
}

export function filterVisibleMessages(messages = [], viewerEmpid) {
  if (!viewerEmpid) return messages;
  const byId = new Map(messages.map((entry) => [String(entry.id), entry]));
  const memo = new Map();

  const canAccessWithHierarchy = (message) => {
    if (!message) return false;
    const key = String(message.id);
    if (memo.has(key)) return memo.get(key);

    if (canViewerAccessMessage(message, viewerEmpid)) {
      memo.set(key, true);
      return true;
    }

    const parentId = normalizeId(message.parent_message_id || message.parentMessageId);
    if (parentId) {
      const canAccessParent = canAccessWithHierarchy(byId.get(parentId));
      memo.set(key, canAccessParent);
      return canAccessParent;
    }

    const rootConversationId = normalizeId(message.conversation_id || message.conversationId);
    if (rootConversationId) {
      const canAccessConversation = canAccessWithHierarchy(byId.get(rootConversationId));
      memo.set(key, canAccessConversation);
      return canAccessConversation;
    }

    memo.set(key, false);
    return false;
  };

  return messages.filter((entry) => canAccessWithHierarchy(entry));
}

export function groupConversations(messages = [], viewerEmpid, participantOverrides = new Map()) {
  const map = new Map();
  const byId = new Map(messages.map((msg) => [String(msg.id), msg]));

  const resolveRootMessageId = (message) => {
    if (!message) return null;
    const conversationId = message.conversation_id || message.conversationId;
    if (conversationId && /^\d+$/.test(String(conversationId))) return Number(conversationId);
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
    const scope = resolveMessageVisibilityScope(msg);
    const link = extractContextLink(msg);
    const hasTopic = Boolean(extractMessageTopic(msg));
    const hasThreadPointer = Boolean(normalizeId(msg.conversation_id || msg.conversationId || msg.parent_message_id || msg.parentMessageId));
    const isGeneralMessage = !hasThreadPointer && !link.linkedType && !link.linkedId && scope === GENERAL_VISIBILITY_SCOPE && !hasTopic;

    if (isGeneralMessage) {
      const key = GENERAL_CONVERSATION_ID;
      if (!map.has(key)) {
        map.set(key, {
          id: GENERAL_CONVERSATION_ID,
          rootMessageId: null,
          participantEmpids: [],
          visibilityScope: GENERAL_VISIBILITY_SCOPE,
          isGeneral: true,
          title: GENERAL_CONVERSATION_TITLE,
          lastMessageAt: null,
          linkedType: null,
          linkedId: null,
          messages: [],
        });
      }
      const bucket = map.get(key);
      bucket.messages.push(msg);
      bucket.lastMessageAt = msg.created_at || bucket.lastMessageAt;
      return;
    }

    const resolvedRootMessageId = resolveRootMessageId(msg);
    const conversationId = buildConversationId(msg, resolvedRootMessageId);
    if (!conversationId) return;
    const rootMessage = resolvedRootMessageId ? byId.get(String(resolvedRootMessageId)) : null;
    const topic = extractMessageTopic(rootMessage || msg);
    const rootLink = extractContextLink(rootMessage || msg);

    if (!map.has(conversationId)) {
      map.set(conversationId, {
        id: conversationId,
        rootMessageId: resolvedRootMessageId,
        participantEmpids: [],
        visibilityScope: scope,
        isGeneral: false,
        title: topic || (rootLink.linkedType === 'transaction' && rootLink.linkedId ? `Transaction #${rootLink.linkedId}` : 'Untitled topic'),
        lastMessageAt: null,
        linkedType: rootLink.linkedType,
        linkedId: rootLink.linkedId,
        messages: [],
      });
    }

    const bucket = map.get(conversationId);
    bucket.messages.push(msg);
    bucket.lastMessageAt = msg.created_at || bucket.lastMessageAt;
    if (scope === 'private') {
      collectMessageParticipantEmpids(msg).forEach((empid) => {
        if (!bucket.participantEmpids.includes(empid)) bucket.participantEmpids.push(empid);
      });
    }
  });

  if (!map.has(GENERAL_CONVERSATION_ID)) {
    map.set(GENERAL_CONVERSATION_ID, {
      id: GENERAL_CONVERSATION_ID,
      rootMessageId: null,
      participantEmpids: [],
      visibilityScope: GENERAL_VISIBILITY_SCOPE,
      isGeneral: true,
      title: GENERAL_CONVERSATION_TITLE,
      lastMessageAt: null,
      linkedType: null,
      linkedId: null,
      messages: [],
    });
  }

  const projected = Array.from(map.values()).map((conversation) => {
    const override = participantOverrides.get(conversation.id);
    if (!override || conversation.isGeneral) return conversation;
    return {
      ...conversation,
      participantEmpids: Array.from(new Set([...conversation.participantEmpids, ...Array.from(override || [])].map(normalizeId).filter(Boolean))),
    };
  }).filter((conversation) => isConversationVisibleToViewer(conversation, viewerEmpid));

  projected.sort((a, b) => {
    if (a.isGeneral) return -1;
    if (b.isGeneral) return 1;
    const aTime = new Date(a.lastMessageAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || 0).getTime();
    return bTime - aTime;
  });

  return projected;
}

export function shouldWarnOnAddRecipient({ isDraftConversation, activeConversation, conversationParticipantIds, recipientId }) {
  if (!recipientId || isDraftConversation) return false;
  if (!activeConversation || activeConversation.isGeneral) return false;
  if (activeConversation.visibilityScope !== 'private') return false;
  return !conversationParticipantIds.has(recipientId);
}
