import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  loadBootstrapBundle,
  loadPageBundle,
  loadFormBundle,
  loadRelationBundle,
  loadTableBundle,
  loadReportBundle,
} from '../services/bundleOrchestration.js';

const router = express.Router();

router.get('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadBootstrapBundle({ user: req.user, query: req.query });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get('/page_bundle', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadPageBundle({ user: req.user, query: req.query });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get('/form_bundle', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadFormBundle({ user: req.user, query: req.query });
    res.json(bundle);
  } catch (err) {
    if (err?.message === 'table and name are required') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
});

router.get('/relations/:table', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadRelationBundle({
      user: req.user,
      table: req.params.table,
      query: req.query,
    });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get('/table_bundle/:table', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadTableBundle({
      user: req.user,
      table: req.params.table,
      query: req.query,
    });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get('/report_bundle/:reportKey', requireAuth, async (req, res, next) => {
  try {
    const bundle = await loadReportBundle({
      user: req.user,
      reportKey: req.params.reportKey,
      query: req.query,
    });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

export default router;
