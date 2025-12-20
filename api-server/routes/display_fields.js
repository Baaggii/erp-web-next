import express from 'express';
import {
  getAllDisplayFields,
  getDisplayFields,
  setDisplayFields,
  removeDisplayFields,
} from '../services/displayFieldConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (table) {
      const { config, isDefault } = await getDisplayFields(
        table,
        companyId,
        req.query.filterColumn ?? req.query.filter_column,
        req.query.filterValue ?? req.query.filter_value,
      );
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await getAllDisplayFields(companyId);
      res.json({ ...config, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, idField, displayFields, filters } = req.body;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await setDisplayFields(table, { idField, displayFields, filters }, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await removeDisplayFields(table, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
