import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { invokePosApiEndpoint } from '../services/posApiService.js';

const router = express.Router();

router.post('/invoke', requireAuth, async (req, res, next) => {
  try {
    const endpointId = req.body?.endpointId || req.body?.id;
    if (!endpointId || typeof endpointId !== 'string') {
      res.status(400).json({ message: 'endpointId is required' });
      return;
    }
    const params =
      (req.body?.params && typeof req.body.params === 'object'
        ? req.body.params
        : req.body?.parameters && typeof req.body.parameters === 'object'
        ? req.body.parameters
        : {}) || {};
    const invokeOptions =
      req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};
    const companyId = Number(req.query.companyId ?? req.user.companyId ?? 0) || null;
    const result = await invokePosApiEndpoint(endpointId, params, {
      ...invokeOptions,
      companyId,
      userId: req.user?.empid ?? null,
    });
    res.json(result);
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({
        message: err.message,
        response: err.response ?? null,
      });
      return;
    }
    next(err);
  }
});

export default router;
