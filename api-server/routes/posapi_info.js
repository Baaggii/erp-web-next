import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getInfoEndpointDefinitions, invokeInfoEndpoint } from '../services/posApiInfo.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ids = req.query.ids ?? req.query.id;
    const endpoints = await getInfoEndpointDefinitions(ids);
    res.json({ endpoints });
  } catch (err) {
    next(err);
  }
});

router.post('/invoke', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId ?? 0);
    const { endpointId, params, body, table, formName } = req.body || {};
    if (!endpointId || typeof endpointId !== 'string') {
      return res.status(400).json({ message: 'endpointId is required' });
    }
    const result = await invokeInfoEndpoint(endpointId, {
      params,
      body,
      companyId,
      userId: req.user?.id ?? null,
      tableName: typeof table === 'string' ? table : undefined,
      formName: typeof formName === 'string' ? formName : undefined,
    });
    res.json(result);
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
});

export default router;
