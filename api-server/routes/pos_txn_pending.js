import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listPending, getPending, savePending, deletePending } from '../services/posTransactionPending.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { id, name } = req.query;
    if (id) {
      const rec = await getPending(id);
      if (!rec || (rec.session?.employeeId && rec.session.employeeId !== req.user.empid)) {
        return res.status(404).json({ message: 'Not found' });
      }
      res.json(rec || {});
    } else {
      const list = await listPending(name, req.user.empid);
      res.json(list);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { id, name, data, masterId, session } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const info = { ...(session || {}), employeeId: req.user.empid };
    const result = await savePending(id, { name, data, masterId, session: info }, req.user.empid);
    res.json({ id: result.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ message: 'id is required' });
    await deletePending(id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
