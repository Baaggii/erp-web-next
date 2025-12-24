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
      const { config, entries, isDefault } = await getDisplayFields(
        table,
        companyId,
        req.query.filterColumn ?? req.query.filter_column,
        req.query.filterValue ?? req.query.filter_value,
        req.query.targetColumn ?? req.query.target_column,
      );
      res.json({ ...config, entries, isDefault });
    } else {
      const { config, isDefault } = await getAllDisplayFields(companyId);
      res.json({ entries: config, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { table, idField, displayFields, filterColumn, filterValue } = req.body;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await setDisplayFields(
      { table, idField, displayFields, filterColumn, filterValue },
      companyId,
    );
    res.sendStatus(204);
  } catch (err) {
    if (err?.message) {
      res.status(400).json({ message: err.message });
    } else {
      next(err);
    }
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const table = req.query.table;
    if (!table) return res.status(400).json({ message: 'table is required' });
    await removeDisplayFields(
      {
        table,
        idField: req.query.idField ?? req.query.id_field,
        filterColumn: req.query.filterColumn ?? req.query.filter_column,
        filterValue: req.query.filterValue ?? req.query.filter_value,
      },
      companyId,
    );
    res.sendStatus(204);
  } catch (err) {
    if (err?.message) {
      res.status(400).json({ message: err.message });
    } else {
      next(err);
    }
  }
});

export default router;
