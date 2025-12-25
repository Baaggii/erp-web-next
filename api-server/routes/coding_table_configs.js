import express from 'express';
import {
  getConfig,
  getAllConfigs,
  setConfig,
  deleteConfig,
} from '../services/codingTableConfig.js';
import { compareSchemas, applySchemaChanges } from '../services/schemaDiff.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (table) {
      const { config, isDefault } = await getConfig(table, companyId);
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await getAllConfigs(companyId);
      res.json({ ...config, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, config } = req.body;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await setConfig(table, config || {}, companyId);
    res.status(200).json({ message: 'Config saved successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await deleteConfig(table, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.post('/schema-diff/run', requireAuth, async (req, res, next) => {
  try {
    const tables = Array.isArray(req.body?.tables) ? req.body.tables : [];
    const baseDir =
      typeof req.body?.baseDir === 'string' && req.body.baseDir.trim()
        ? req.body.baseDir.trim()
        : undefined;
    const diff = await compareSchemas({ tables, baseDir });
    res.json(diff);
  } catch (err) {
    next(err);
  }
});

router.post('/schema-diff/apply', requireAuth, async (req, res, next) => {
  try {
    const { changes, allowDrops = false, dryRun = false } = req.body || {};
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ message: 'changes array required' });
    }
    const result = await applySchemaChanges(changes, { allowDrops, dryRun });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
