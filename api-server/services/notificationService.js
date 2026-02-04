let ioEmitter = null;
let dbPool = null;

export function setNotificationEmitter(io) {
  ioEmitter = io || null;
}

export function setNotificationStore(store) {
  dbPool = store || null;
}

function normalizeRecipient(recipientEmpId) {
  if (recipientEmpId === undefined || recipientEmpId === null) {
    throw new Error('recipientEmpId required');
  }
  const normalized = String(recipientEmpId).trim();
  if (!normalized) {
    throw new Error('recipientEmpId required');
  }
  return normalized;
}

function normalizeType(type) {
  const normalized = type ? String(type).trim().toLowerCase() : 'request';
  if (!normalized) {
    throw new Error('type required');
  }
  if (!['request', 'response'].includes(normalized)) {
    throw new Error(`Invalid notification type: ${normalized}`);
  }
  return normalized;
}

function normalizeKind(kind, fallback) {
  const normalized = kind ? String(kind).trim() : fallback;
  if (!normalized) {
    throw new Error('kind required');
  }
  return normalized;
}

export async function notifyUser({
  companyId,
  recipientEmpId,
  type,
  kind,
  message,
  relatedId,
  createdBy,
  io,
  connection,
}) {
  const recipient = normalizeRecipient(recipientEmpId);
  const normalizedType = normalizeType(type);
  const normalizedKind = normalizeKind(kind, normalizedType);
  const normalizedMessage = message ?? '';
  const createdAt = new Date();
  const db = connection ?? dbPool;
  if (!db) {
    throw new Error('Notification store not configured');
  }
  const [result] = await db.query(
    `INSERT INTO notifications
      (company_id, recipient_empid, type, related_id, message, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId ?? null,
      recipient,
      normalizedType,
      relatedId ?? null,
      normalizedMessage,
      createdBy ?? null,
      createdAt,
    ],
  );
  const payload = {
    id: result?.insertId ?? null,
    type: normalizedType,
    kind: normalizedKind,
    message: normalizedMessage,
    related_id: relatedId ?? null,
    created_at: createdAt.toISOString(),
    sender: createdBy ?? null,
  };
  const emitter = io ?? ioEmitter;
  if (!emitter) {
    throw new Error('Notification emitter not configured');
  }
  emitter.to(`user:${recipient}`).emit('notification:new', payload);
  return payload;
}
