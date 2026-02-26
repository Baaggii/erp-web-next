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
  postMessage,
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

const postMessageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['idempotencyKey', 'body'],
  properties: {
    companyId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 255 },
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    linkedType: { type: 'string', minLength: 1, maxLength: 64 },
    linkedId: { type: 'string', minLength: 1, maxLength: 128 },
    visibilityScope: { type: 'string', enum: ['company', 'department', 'private'] },
    visibilityDepartmentId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    visibilityEmpid: { type: 'string', minLength: 1, maxLength: 64 },
    recipientEmpids: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 64 },
    },
    clientTempId: { type: 'string', minLength: 1, maxLength: 128 },
    conversationId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    conversation_id: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
    parentMessageId: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] },
  },
};


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
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    return value.every((item) => validateSchema(schema.items || {}, item));
  }

  if (schema.anyOf) {
    return schema.anyOf.some((option) => validateSchema(option, value));
  }

  if (schema.type === 'integer') {
    return Number.isInteger(value);
  }

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

function correlation(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || createCorrelationId();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}

router.use(correlation);

const ajv = new Ajv();
const validatePostMessage = ajv.compile(postMessageSchema);


function normalizeConversationPayload(req, _res, next) {
  if (req?.body && typeof req.body === 'object') {
    if (req.body.conversation_id != null && req.body.conversationId == null) {
      req.body.conversationId = req.body.conversation_id;
    }
    if (req.body.conversationId != null && req.body.conversation_id == null) {
      req.body.conversation_id = req.body.conversationId;
    }
  }
  next();
}


function validatePostMessageBody(req, res, next) {
  if (validatePostMessage(req.body)) return next();
  return res.status(400).json({
    status: 400,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid message payload',
      correlationId: req.correlationId,
    },
  });
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

router.post('/messages', normalizeConversationPayload, validatePostMessageBody, (req, res) =>
  handle(
    res,
    req,
    () =>
      postMessage({
        user: req.user,
        companyId: req.body?.companyId ?? req.query.companyId,
        payload: req.body,
        correlationId: req.correlationId,
      }),
    201,
  ));

router.get('/conversations', (req, res) =>
  handle(res, req, () =>
    listConversations({
      user: req.user,
      companyId: req.query.companyId,
      linkedType: req.query.linkedType,
      linkedId: req.query.linkedId,
      cursor: req.query.cursor,
      limit: req.query.limit,
      correlationId: req.correlationId,
    })));

router.post('/conversations', normalizeConversationPayload, validatePostMessageBody, (req, res) =>
  handle(
    res,
    req,
    () =>
      createConversationRoot({
        user: req.user,
        companyId: req.body?.companyId ?? req.query.companyId,
        payload: req.body,
        correlationId: req.correlationId,
      }),
    201,
  ));

router.get('/conversations/:conversationId/messages', (req, res) =>
  handle(res, req, () =>
    getConversationMessages({
      user: req.user,
      companyId: req.query.companyId,
      conversationId: Number(req.params.conversationId),
      cursor: req.query.cursor,
      limit: req.query.limit,
      correlationId: req.correlationId,
    })));

router.post('/conversations/:conversationId/messages', normalizeConversationPayload, validatePostMessageBody, (req, res) =>
  handle(
    res,
    req,
    () =>
      postConversationMessage({
        user: req.user,
        companyId: req.body?.companyId ?? req.query.companyId,
        conversationId: Number(req.params.conversationId),
        payload: req.body,
        correlationId: req.correlationId,
      }),
    201,
  ));

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
