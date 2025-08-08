import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  callStoredProcedure,
  listStoredProcedures,
  getProcedureParams,
  getProcedureRawRows,
} from '../../db/index.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const procedures = (await listStoredProcedures()).filter((p) =>
      typeof p === 'string' && p.toLowerCase().includes('report'),
    );
    res.json({ procedures });
  } catch (err) {
    next(err);
  }
});

router.get('/:name/params', requireAuth, async (req, res, next) => {
  try {
    const parameters = await getProcedureParams(req.params.name);
    res.json({ parameters });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, params, aliases } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name required' });
    const row = await callStoredProcedure(
      name,
      Array.isArray(params) ? params : [],
      Array.isArray(aliases) ? aliases : [],
    );
    res.json({ row });
  } catch (err) {
    next(err);
  }
});

router.post('/raw', requireAuth, async (req, res, next) => {
  try {
    const { name, params, column, groupField, groupValue, session } = req.body || {};
    if (!name || !column)
      return res.status(400).json({ message: 'name and column required' });
    const { rows, sql, original, file } = await getProcedureRawRows(
      name,
      params || {},
      column,
      groupField,
      groupValue,
      { ...(session || {}), empid: req.user?.empid },
    );
    res.json({ rows, sql, original, file });
  } catch (err) {
    next(err);
  }
});

export default router;
