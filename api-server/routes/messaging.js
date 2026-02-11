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

function correlation(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || createCorrelationId();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}

router.use(correlation);

async function handle(res, req, work, okStatus = 200) {
  try {
    const data = await work();
    return res.status(okStatus).json(data);
  } catch (error) {
    const structured = toStructuredError(error, req.correlationId);
    return res.status(structured.status).json(structured);
  }
}

router.post('/messages', (req, res) =>
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
