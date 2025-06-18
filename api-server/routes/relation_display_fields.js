import express from 'express';
import { getRelatedDisplay, getAllRelatedDisplays, setRelatedDisplay } from '../services/relationFieldConfig.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { table, field } = req.query;
    if (table && field) {
      const cfg = await getRelatedDisplay(table, field);
      res.json(cfg || []);
    } else if (table) {
      const cfg = await getRelatedDisplay(table);
      res.json(cfg);
    } else {
      const cfg = await getAllRelatedDisplays();
      res.json(cfg);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { table, field, displayFields } = req.body;
    if (!table || !field) {
      return res.status(400).json({ message: 'table and field are required' });
    }
    await setRelatedDisplay(table, field, displayFields);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
