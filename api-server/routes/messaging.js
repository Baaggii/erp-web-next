import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.js';
import {
  createCorrelationId,
  createConversationRoot,
  deleteMessage,
  getConversationMessages,
  listConversations,
  getPresence,
  patchMessage,
  postConversationMessage,
  presenceHeartbeat,
  switchCompanyContext,
  toStructuredError,
} from '../services/messagingService.js';

const router = express.Router();
router.use(requireAuth);

const messagingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 8 } });
const messagingUploadDir = path.resolve(process.cwd(), 'uploads', 'messaging');

function safeAttachmentName(input = '') {
  const name = String(input || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  return name || 'file';
}

class Ajv {
  compile(schema) {
    return (value) => validateSchema(schema, value);
  }
}

function validateSchema(schema, value) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      if (keys.some((key) => !allowed.has(key))) return false;
    }
    if ((schema.required || []).some((key) => !(key in value))) return false;
    return keys.every((key) => {
      const childSchema = schema.properties?.[key];
      if (!childSchema) return schema.additionalProperties !== false;
      return validateSchema(childSchema, value[key]);
    });
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    return value.every((item) => validateSchema(schema.items || {}, item));
  }
  if (schema.anyOf) return schema.anyOf.some((option) => validateSchema(option, value));
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.enum && !schema.enum.includes(value)) return false;
    return true;
  }
  return true;
}

const createConversationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'participants', 'body'],
  properties: {
    companyId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    type: { type: 'string', enum: ['private', 'linked'] },
    participants: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: 64 } },
    topic: { type: 'string', maxLength: 255 },
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    messageClass: { type: 'string', enum: ['general', 'financial', 'hr_sensitive', 'legal'] },
    linkedType: { type: 'string', maxLength: 64 },
    linkedId: { type: 'string', maxLength: 128 },
  },
};

const postConversationMessageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    companyId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    topic: { type: 'string', maxLength: 255 },
    messageClass: { type: 'string', enum: ['general', 'financial', 'hr_sensitive', 'legal'] },
    parentMessageId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
  },
};

function correlation(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || createCorrelationId();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
router.use(correlation);

const ajv = new Ajv();
const validateCreateConversation = ajv.compile(createConversationSchema);
const validatePostConversationMessage = ajv.compile(postConversationMessageSchema);

function validateBody(validator, message) {
  return (req, res, next) => {
    if (validator(req.body)) return next();
    return res.status(400).json({ status: 400, error: { code: 'VALIDATION_ERROR', message, correlationId: req.correlationId } });
  };
}

async function handle(res, req, work, okStatus = 200) {
  try {
    const data = await work();
    return res.status(okStatus).json(data);
  } catch (error) {
    const structured = toStructuredError(error, req.correlationId);
    return res.status(structured.status).json(structured);
  }
}

router.get('/conversations', (req, res) =>
  handle(res, req, () => listConversations({ user: req.user, companyId: req.query.companyId, cursor: req.query.cursor, limit: req.query.limit, correlationId: req.correlationId })));

router.post('/conversations', validateBody(validateCreateConversation, 'Invalid conversation payload'), (req, res) =>
  handle(res, req, () => createConversationRoot({ user: req.user, companyId: req.body?.companyId ?? req.query.companyId, payload: req.body, correlationId: req.correlationId }), 201));

router.get('/conversations/:conversationId/messages', (req, res) =>
  handle(res, req, () => getConversationMessages({ user: req.user, companyId: req.query.companyId, conversationId: Number(req.params.conversationId), cursor: req.query.cursor, limit: req.query.limit, correlationId: req.correlationId })));

router.post('/conversations/:conversationId/messages', validateBody(validatePostConversationMessage, 'Invalid message payload'), (req, res) =>
  handle(res, req, () => postConversationMessage({ user: req.user, companyId: req.body?.companyId ?? req.query.companyId, conversationId: Number(req.params.conversationId), payload: req.body, correlationId: req.correlationId }), 201));

router.post('/uploads', messagingUpload.array('files', 8), async (req, res) => {
  try {
    const companyId = Number(req.body?.companyId || req.query.companyId || req.user?.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ message: 'companyId is required' });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const companyDir = path.join(messagingUploadDir, String(companyId));
    await fs.mkdir(companyDir, { recursive: true });

    const items = [];
    for (const file of files) {
      const safeName = safeAttachmentName(file.originalname || 'file');
      const token = crypto.randomUUID();
      const storedName = `${token}_${safeName}`;
      const fullPath = path.join(companyDir, storedName);
      await fs.writeFile(fullPath, file.buffer);
      items.push({
        id: token,
        name: safeName,
        type: file.mimetype || 'application/octet-stream',
        size: Number(file.size) || 0,
        url: `/api/messaging/uploads/${encodeURIComponent(companyId)}/${encodeURIComponent(storedName)}`,
      });
    }

    return res.status(201).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Upload failed' });
  }
});

router.get('/uploads/:companyId/:storedName', async (req, res) => {
  const companyId = Number(req.params.companyId);
  const userCompanyId = Number(req.user?.companyId);
  if (!Number.isFinite(companyId) || companyId <= 0 || companyId !== userCompanyId) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const storedName = path.basename(String(req.params.storedName || ''));
  if (!storedName) return res.status(404).end();
  const fullPath = path.join(messagingUploadDir, String(companyId), storedName);
  try {
    await fs.access(fullPath);
    return res.sendFile(fullPath);
  } catch {
    return res.status(404).end();
  }
});

router.patch('/messages/:id', (req, res) =>
  handle(res, req, () =>
    patchMessage({
      user: req.user,
      companyId: req.body?.companyId ?? req.query.companyId,
      messageId: Number(req.params.id),
      payload: req.body,
      correlationId: req.correlationId,
    })));

router.delete('/messages/:id', (req, res) =>
  handle(res, req, () =>
    deleteMessage({
      user: req.user,
      companyId: req.body?.companyId ?? req.query.companyId,
      messageId: Number(req.params.id),
      correlationId: req.correlationId,
    })));

router.post('/presence/heartbeat', (req, res) =>
  handle(res, req, () =>
    presenceHeartbeat({
      user: req.user,
      companyId: req.body?.companyId ?? req.query.companyId,
      status: req.body?.status,
      correlationId: req.correlationId,
    })));

router.get('/presence', (req, res) =>
  handle(res, req, () =>
    getPresence({
      user: req.user,
      companyId: req.query.companyId,
      userIds: req.query.userIds,
      correlationId: req.correlationId,
    })));

router.post('/context/switch-company', (req, res) =>
  handle(res, req, () =>
    switchCompanyContext({
      user: req.user,
      companyId: req.body?.companyId ?? req.query.companyId,
      correlationId: req.correlationId,
    })));

export default router;
