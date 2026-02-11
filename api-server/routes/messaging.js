import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  createCorrelationId,
  deleteMessage,
  getMessages,
  getPresence,
  getThread,
  patchMessage,
  postMessage,
  postReply,
  presenceHeartbeat,
  switchCompanyContext,
  toStructuredError,
} from '../services/messagingService.js';

const router = express.Router();
router.use(requireAuth);

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
    clientTempId: { type: 'string', minLength: 1, maxLength: 128 },
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

router.post('/messages', validatePostMessageBody, (req, res) =>
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

router.get('/messages', (req, res) =>
  handle(res, req, () =>
    getMessages({
      user: req.user,
      companyId: req.query.companyId,
      linkedType: req.query.linkedType,
      linkedId: req.query.linkedId,
      cursor: req.query.cursor,
      limit: req.query.limit,
      correlationId: req.correlationId,
    })));

router.get('/messages/:id/thread', (req, res) =>
  handle(res, req, () =>
    getThread({
      user: req.user,
      companyId: req.query.companyId,
      messageId: Number(req.params.id),
      correlationId: req.correlationId,
    })));

router.post('/messages/:id/reply', (req, res) =>
  handle(
    res,
    req,
    () =>
      postReply({
        user: req.user,
        companyId: req.body?.companyId ?? req.query.companyId,
        messageId: Number(req.params.id),
        payload: req.body,
        correlationId: req.correlationId,
      }),
    201,
  ));

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
