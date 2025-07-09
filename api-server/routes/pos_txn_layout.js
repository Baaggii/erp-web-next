import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getLayout, getAllLayouts, setLayout } from '../services/posTransactionLayout.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const name = req.query.name;
    if (name) {
      const cfg = await getLayout(name);
      res.json(cfg || {});
    } else {
      const all = await getAllLayouts();
      res.json(all);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, layout } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await setLayout(name, layout || {});
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
