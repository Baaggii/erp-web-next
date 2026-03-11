import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listTwinState } from '../services/twinStateService.js';

const router = express.Router();

router.get('/plan', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('plan_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/budget', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('budget_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/risk', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('risk_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/task-load', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('task_load', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/resource', requireAuth, async (req, res, next) => {
  try {
    res.json(await listTwinState('resource_state', req.user.companyId, req.query));
  } catch (error) {
    next(error);
  }
});

export default router;
